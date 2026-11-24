import sys
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from common import call
Q = "http://127.0.0.1:18080/auth"
PW = "Live-test-Passphrase-42!"
s, b, _ = call("POST", f"{Q}/bootstrap", {"email": "root@example.com", "password": PW, "setup_token": "live-setup-token-123456"})
assert s in (200, 201, 204), (s, b)
s, b, _ = call("POST", f"{Q}/login", {"email": "root@example.com", "password": PW}); assert s == 200, (s, b)
tok = b.get("access_token") or b.get("accessToken")
if b.get("status") == "mfa_required":
    sys.exit("admin needs mfa")
H = {"authorization": f"Bearer {tok}"}
s, b, _ = call("POST", f"{Q}/step-up", {"password": PW}, H); assert s == 200, (s, b)
s, b, _ = call("POST", f"{Q}/admin/oidc-clients", {"name": "QBase", "redirect_uris": ["http://localhost:13001/cb"], "public": True}, H); assert s == 201, (s, b)
cid = b["client_id"]
s, b, _ = call("POST", f"{Q}/admin/projects/{cid}/first-admin", {"email": "ann@example.com"}, H); assert s == 201, (s, b)
inv = b["token"]
s, b, _ = call("POST", f"{Q}/register", {"token": inv, "email": "ann@example.com", "password": PW}); assert s in (200, 201), (s, b)
print(f"CLIENT_ID={cid}")
print(f"INVITE_DONE=1")
