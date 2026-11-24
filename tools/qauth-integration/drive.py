import sys, subprocess, hmac, hashlib, struct, time, base64
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from common import call
Q = "http://127.0.0.1:18080/auth"
B = "http://127.0.0.1:13001"
PW = "Live-test-Passphrase-42!"
ids = dict(l.strip().split("=", 1) for l in open(__import__("os").environ.get("IDS_ENV", "ids.env")) if "=" in l)
CID = ids["CLIENT_ID"]
ok = fail = 0
def check(name, cond, extra=""):
    global ok, fail
    if cond: ok += 1; print(f"  ok   {name}")
    else: fail += 1; print(f"  FAIL {name} {extra}")
def cookie_of(h):
    c = h.get("set-cookie") or ""
    return c.split(";")[0] if c else ""
def totp(secret):
    key = base64.b32decode(secret.upper() + "=" * (-len(secret) % 8))
    step = int(time.time() // 30)
    d = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    o = d[-1] & 15
    return f"{(struct.unpack('>I', d[o:o+4])[0] & 0x7fffffff) % 1000000:06d}"
def psql(sql):
    return subprocess.run(["docker", "exec", "live-qbase-db", "psql", "-U", "qbase", "-d", "qbase", "-tAc", sql], capture_output=True, text=True).stdout.strip()

print("QBase in QAuth mode, against a real QAuth")
s, b, _ = call("GET", f"{B}/auth/setup-status")
check("setup-status says QAuth and shows no setup form", s == 200 and b.get("authProvider") == "qauth" and b.get("needsSetup") is False, b)

s, b, h = call("POST", f"{B}/auth/login", {"email": "ann@example.com", "password": "wrong-password-123"})
check("a wrong password is refused like a local one", s == 401 and b.get("error") == "invalid_credentials", (s, b))

s, b, h = call("POST", f"{B}/auth/login", {"email": "ann@example.com", "password": PW})
ann = cookie_of(h)
check("the first person to sign in is QBase's admin", s == 200 and b.get("isAdmin") is True and ann, (s, b))
s, b, _ = call("GET", f"{B}/auth/me", cookies=ann)
check("/auth/me works on the QBase session", s == 200 and b.get("email") == "ann@example.com", (s, b))
s, b, _ = call("GET", f"{B}/projects", cookies=ann)
check("QBase's own routes work for them", s == 200, (s, b))
row = psql("select qauth_sub is not null, password_hash is null from users where email='ann@example.com'")
check("QBase keeps the person's QAuth id and no password", row == "t|t", row)
check("QBase keeps QAuth's refresh token with the session, encrypted", psql("select idp_refresh_enc like 'v%' from sessions") == "t")

# a second person: invited at QAuth by the app's own administrator
s, b, _ = call("POST", f"{Q}/login", {"email": "ann@example.com", "password": PW, "client_id": CID})
tok = b["access_token"]; H = {"authorization": f"Bearer {tok}"}
call("POST", f"{Q}/step-up", {"password": PW}, H)
s, b, _ = call("POST", f"{Q}/admin/projects/{CID}/invitations", {}, H)
check("QAuth's app administrator invites a person", s == 201, (s, b))
s, b2, _ = call("POST", f"{Q}/register", {"token": b["token"], "email": "bob@example.com", "password": PW})
check("the person registers at QAuth", s in (200, 201), (s, b2))
s, b, h = call("POST", f"{B}/auth/login", {"email": "bob@example.com", "password": PW})
bob = cookie_of(h)
check("their first QBase sign-in makes a plain account", s == 200 and b.get("isAdmin") is False, (s, b))
s, b, _ = call("GET", f"{B}/admin/users", cookies=bob)
check("QBase's roles are QBase's: bob is not an admin there", s in (401, 403, 404), (s, b))

# two-step is QAuth's
call("POST", f"{Q}/step-up", {"password": PW}, H)
s, b, _ = call("POST", f"{Q}/mfa/enroll", None, H)
secret = b.get("secret") or ""
check("QAuth starts the authenticator set-up", bool(secret), (s, b))
if secret:
    s, b, _ = call("POST", f"{Q}/mfa/confirm", {"code": totp(secret)}, H)
    check("two-step turned on at QAuth", s in (200, 201), (s, b))
    time.sleep(1)
    s, b, h = call("POST", f"{B}/auth/login", {"email": "ann@example.com", "password": PW})
    check("QBase asks for the code QAuth wants", s == 200 and b.get("mfaRequired") is True and b.get("challenge"), (s, b))
    ch = b.get("challenge")
    s, b, h = call("POST", f"{B}/auth/login/mfa", {"challenge": ch, "code": "000000"})
    check("a wrong code is refused", s == 401, (s, b))
    s, b, h = call("POST", f"{B}/auth/login", {"email": "ann@example.com", "password": PW})
    ch = b.get("challenge")
    # the same 30 s step cannot be used twice: wait for the next one
    time.sleep(31)
    s, b, h = call("POST", f"{B}/auth/login/mfa", {"challenge": ch, "code": totp(secret)})
    ann2 = cookie_of(h)
    check("the right code opens a session", s == 200 and ann2, (s, b))

# the QAuth sign-in behind a QBase session ends -> QBase notices
s, b, h = call("POST", f"{B}/auth/login", {"email": "bob@example.com", "password": PW})
bob = cookie_of(h)
call("POST", f"{Q}/login", {"email": "bob@example.com", "password": PW, "client_id": CID})
s, b, _ = call("POST", f"{Q}/login", {"email": "bob@example.com", "password": PW, "client_id": CID})
btok = b["access_token"]
s, _, _ = call("POST", f"{Q}/change-password", {"current_password": PW, "new_password": PW + "x"}, {"authorization": f"Bearer {btok}"})
check("bob changes his password at QAuth", s == 204, s)
psql("update sessions set idp_checked_at = now() - interval '10 minutes'")
s, b, _ = call("GET", f"{B}/auth/me", cookies=bob)
check("QBase ends bob's session once QAuth says that sign-in is over", s == 401, (s, b))
s, b, h = call("POST", f"{B}/auth/login", {"email": "bob@example.com", "password": PW + "x"})
bob = cookie_of(h)
check("and the new password works through QBase", s == 200, (s, b))
s, b, _ = call("POST", f"{B}/auth/change-password", {"currentPassword": PW + "x", "newPassword": PW + "y"}, cookies=bob)
check("QBase changes the password at QAuth", s == 200, (s, b))
s, b, _ = call("POST", f"{Q}/login", {"email": "bob@example.com", "password": PW + "y", "client_id": CID})
check("QAuth has the new password", s == 200 and b.get("access_token"), (s, b))

s, b, _ = call("POST", f"{B}/auth/logout", None, cookies=bob)
check("logout through QBase", s == 200, (s, b))
s, b, _ = call("GET", f"{B}/auth/me", cookies=bob)
check("and the session is gone", s == 401, (s, b))

print("OpenID Connect (the redirect way) against the same QAuth")
import hashlib, os, urllib.parse, urllib.request, json
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
opener = urllib.request.build_opener(NoRedirect)
def get_nr(url, cookie=""):
    req = urllib.request.Request(url, headers={"cookie": cookie} if cookie else {})
    try:
        r = opener.open(req, timeout=20); return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()
def form(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    try:
        r = urllib.request.urlopen(req, timeout=20); return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except ValueError: return e.code, {"raw": raw}
s, b, h = call("POST", f"{Q}/login", {"email": "bob@example.com", "password": PW + "y", "client_id": CID})
browser = cookie_of(h)
check("a browser session at QAuth (refresh cookie)", bool(browser), (s, b))
verifier = base64.urlsafe_b64encode(os.urandom(48)).rstrip(b"=").decode()
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
params = {"response_type": "code", "client_id": CID, "redirect_uri": "http://localhost:13001/cb", "scope": "openid email offline_access",
          "state": "s1", "nonce": "n1", "code_challenge": challenge, "code_challenge_method": "S256"}
st, hd, _ = get_nr(f"{Q}/oidc/authorize?" + urllib.parse.urlencode(params), browser)
loc = hd.get("location") or hd.get("Location") or ""
code = urllib.parse.parse_qs(urllib.parse.urlsplit(loc).query).get("code", [""])[0]
check("authorize hands back a code (PKCE)", st == 302 and code, (st, loc))
st, tok = form(f"{Q}/oidc/token", {"grant_type": "authorization_code", "code": code, "redirect_uri": "http://localhost:13001/cb", "code_verifier": verifier, "client_id": CID})
check("the token endpoint gives an ID token, an access token and a refresh token", st == 200 and tok.get("id_token") and tok.get("refresh_token"), (st, tok))
st, tok2 = form(f"{Q}/oidc/token", {"grant_type": "refresh_token", "refresh_token": tok.get("refresh_token", ""), "client_id": CID})
check("the refresh token gives new tokens and a successor", st == 200 and tok2.get("refresh_token") and tok2["refresh_token"] != tok["refresh_token"], (st, tok2))
s, info, _ = call("GET", f"{Q}/oidc/userinfo", None, {"authorization": "Bearer " + tok2.get("access_token", "")})
check("userinfo works with the new access token and has no roles", s == 200 and info.get("email") == "bob@example.com" and "roles" not in info, (s, info))
st, _ = form(f"{Q}/oidc/revoke", {"token": tok2["refresh_token"], "client_id": CID})
check("the app withdraws its refresh token", st == 200, st)
st, again = form(f"{Q}/oidc/token", {"grant_type": "refresh_token", "refresh_token": tok2["refresh_token"], "client_id": CID})
check("a withdrawn refresh token no longer works", st == 400 and again.get("error") == "invalid_grant", (st, again))
st, hd, _ = get_nr(f"{Q}/oidc/logout?" + urllib.parse.urlencode({"id_token_hint": tok["id_token"], "post_logout_redirect_uri": "http://localhost:13001/signed-out", "state": "bye"}), browser)
check("RP-initiated logout ends the sign-in and returns to the app", st == 302 and (hd.get("location") or "") == "http://localhost:13001/signed-out?state=bye", (st, hd.get("location")))
s, b, _ = call("GET", f"{Q}/me", None, {"authorization": "Bearer " + b["access_token"]})
check("the QAuth session of that browser is over", s == 401, (s, b))
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
