
issues:

the following 2 requests appear with errors in console here on mac, this is my first test on mac. also in security it says resource was requested insecurely for both, any idea what the problem is? this happens on mac/safari, not on windows.
Summary
URL: http://localhost:3001/api/notifications/events
Status: —
Source: —

Request
Accept: text/event-stream
Cache-Control: no-cache
Origin: http://localhost:5173
Pragma: no-cache
Referer: http://localhost:5173/
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15

Response
No response headers

Summary
URL: http://localhost:3001/api/events?boardId=1
Status: —
Source: —

Request
Accept: text/event-stream
Cache-Control: no-cache
Origin: http://localhost:5173
Pragma: no-cache
Referer: http://localhost:5173/
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15

Response
No response headers

Query String Parameters
boardId: 1



Summary
URL: http://localhost:3001/api/events?boardId=1
Status: —
Source: —
Summary
URL: http://localhost:3001/api/events?boardId=1
Status: —
Source: —

Request
Accept: text/event-stream
Cache-Control: no-cache
Origin: http://localhost:5173
Pragma: no-cache
Referer: http://localhost:5173/
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15

Response
No response headers

Query String Parameters
boardId: 1
Request
Accept: text/event-stream
Cache-Control: no-cache
Origin: http://localhost:5173
Pragma: no-cache
Referer: http://localhost:5173/
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-site
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15

Response
No response headers

Query String Parameters
boardId: 1


=====================

Issue Response:

Here is a concise read of what you are seeing and what usually causes it on **Mac + Safari** with your setup.

## What the symptoms usually mean

- **`Status: —` and “No response headers”** in Web Inspector often means the browser never treated the request as a normal completed HTTP exchange: connection failed, the request was blocked before a usable response, or Safari is not surfacing the response the way Chrome does (CORS / long-lived stream edge cases).
- Your app uses **`EventSource` with `withCredentials: true`** against **`http://localhost:3001`** while the UI is on **`http://localhost:5173`** — that is **cross-origin** (different ports), so **CORS + cookies** must be correct. Safari is generally **stricter** than Chrome/Edge here.

```44:44:src/client/api/useBoardChangeStream.ts
    const es = new EventSource(sseUrl, { withCredentials: true });
```

```28:28:src/client/api/useNotificationStream.ts
    const es = new EventSource(notificationEventsUrl(), { withCredentials: true });
```

## “Resource was requested insecurely” (Security tab)

That wording in Safari is **often about plain HTTP**, not necessarily a separate bug: both your page and API URLs are `http://`, so WebKit is flagging them as **not secure**. That alone does not explain a failed stream.

It **does** matter if anything in the chain is **HTTPS** (e.g. you open the app as `https://localhost:5173`, or a proxy/VPN “upgrades” traffic): then **`http://localhost:3001` becomes mixed content** and Safari can **block** it. In that case you would see failures and odd network entries. **Confirm the address bar is exactly `http://`, not `https://`, for both dev server and API.**

## Mac-specific issues that do **not** happen the same way on Windows

1. **`localhost` = IPv6 vs IPv4**  
   On many Macs, `localhost` resolves to **`::1` first**. Your client builds the API base as `window.location.protocol` + `window.location.hostname` + `:3001`. If the Bun server is effectively only reachable on **`127.0.0.1`** (or the opposite), you can get **connection failures** that show up as empty/broken network lines. The CLI in this repo even prefers **`127.0.0.1`** for the API URL, which hints that **explicit IPv4** is sometimes important:

```33:33:src/cli/lib/api-client.ts
  return `http://127.0.0.1:${resolvePort(overrides)}`;
```

   **Quick isolation:** open the app at `http://127.0.0.1:5173` (not `localhost`) or set `VITE_API_ORIGIN` to `http://127.0.0.1:3001` and see if SSE starts working.

2. **Safari vs Chrome on the same Mac**  
   If **Chrome on Mac works** but **Safari does not**, lean toward **Safari + credentialed EventSource + CORS/cookies**. If **both fail on Mac**, lean toward **network/bind address/port/firewall**.

3. **Local Network / firewall**  
   Less common for loopback, but worth ruling out if something is blocking the Bun process from accepting connections on `3001`.

## What to verify next (no code changes required)

1. **Exact URLs:** both UI and API must stay on **`http://`** during this test.  
2. **Same machine:** `curl -v 'http://127.0.0.1:3001/api/health'` and `curl -v 'http://localhost:3001/api/health'` — if one works and one does not, you have the **IPv4/IPv6 localhost** issue.  
3. **Compare browsers on the Mac:** Safari vs Chrome with the same `http://localhost:5173` session.  
4. **Console / Security exact message:** if you see **mixed content**, fix scheme (all HTTP or all HTTPS with a proper dev setup), not CORS.

I am in **Ask mode**, so I cannot run those commands or change the project for you; if you paste the **exact Safari console error string** (and whether Chrome on Mac works), we can narrow it to one of the lines above very quickly.