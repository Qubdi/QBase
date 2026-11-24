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
print(f"\n{ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
