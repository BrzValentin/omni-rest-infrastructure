import http from "node:http";

const upstream = new URL("http://127.0.0.1:5279");
let recoverableErrorRequests = 0;

function sendTemporaryFailure(response) {
  response.writeHead(503, { "content-type": "application/problem+json" });
  response.end(JSON.stringify({ title: "Temporary test failure", status: 503 }));
}

function forward(request, response, host) {
  const upstreamRequest = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", (error) => {
    response.writeHead(502, { "content-type": "application/problem+json" });
    response.end(JSON.stringify({ title: "Test proxy upstream failure", detail: error.message, status: 502 }));
  });
  request.pipe(upstreamRequest);
}

const server = http.createServer((request, response) => {
  const host = request.headers.host?.split(":", 1)[0]?.toLowerCase() ?? "";

  if (host === "error.localhost" && recoverableErrorRequests++ === 0) {
    sendTemporaryFailure(response);
    return;
  }

  const upstreamHost = host === "error.localhost" || host === "slow.localhost" ? "menu.localhost" : host;
  if (host === "slow.localhost") {
    setTimeout(() => forward(request, response, upstreamHost), 1_500);
    return;
  }

  forward(request, response, upstreamHost);
});

server.listen(5290, "127.0.0.1");

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
