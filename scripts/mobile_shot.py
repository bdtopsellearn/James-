#!/usr/bin/env python3
"""Capture mobile-viewport screenshots via CDP (port 9222)."""
import json, sys, time, base64, urllib.request
import websocket

CDP = "http://localhost:9222"

def get_page_ws():
    tabs = json.load(urllib.request.urlopen(CDP + "/json"))
    pages = [t for t in tabs if t.get("type") == "page"]
    if not pages:
        raise RuntimeError("no page tab")
    return pages[0]["webSocketDebuggerUrl"]

class CDPClient:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, max_size=200*1024*1024, suppress_origin=True)
        self.i = 0
    def send(self, method, params=None):
        self.i += 1
        mid = self.i
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == mid:
                return msg
    def close(self):
        try: self.ws.close()
        except Exception: pass

def main():
    url = sys.argv[1]
    out = sys.argv[2]
    width = int(sys.argv[3]) if len(sys.argv) > 3 else 390
    height = int(sys.argv[4]) if len(sys.argv) > 4 else 844
    full = (len(sys.argv) > 5 and sys.argv[5] == "full")

    c = CDPClient(get_page_ws())
    c.send("Page.enable")
    c.send("Emulation.setDeviceMetricsOverride", {
        "width": width, "height": height,
        "deviceScaleFactor": 2, "mobile": True,
    })
    c.send("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 5})
    c.send("Page.navigate", {"url": url})
    time.sleep(4)
    params = {"format": "png"}
    if full:
        params["captureBeyondViewport"] = True
    r = c.send("Page.captureScreenshot", params)
    data = r["result"]["data"]
    with open(out, "wb") as f:
        f.write(base64.b64decode(data))
    print("saved", out)
    c.close()

if __name__ == "__main__":
    main()
