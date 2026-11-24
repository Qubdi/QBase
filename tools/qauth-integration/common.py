import json, urllib.request, urllib.error
def call(method, url, body=None, headers=None, cookies=None):
    h = {"accept": "application/json", **(headers or {})}
    data = None
    if body is not None:
        data = json.dumps(body).encode(); h["content-type"] = "application/json"
    if cookies: h["cookie"] = cookies
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=20)
        raw = r.read().decode(); status = r.status; hdrs = r.headers
    except urllib.error.HTTPError as e:
        raw = e.read().decode(); status = e.code; hdrs = e.headers
    try: parsed = json.loads(raw) if raw else {}
    except ValueError: parsed = {"raw": raw}
    return status, parsed, hdrs
