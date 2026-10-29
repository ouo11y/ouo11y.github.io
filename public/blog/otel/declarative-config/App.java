import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.Executors;

// A tiny shop API: /api/orders calls /api/stock; /healthz is what a load balancer polls.
public class App {
  static final HttpClient client = HttpClient.newHttpClient();

  static String get(String path) throws Exception {
    var req = HttpRequest.newBuilder(URI.create("http://localhost:8080" + path)).build();
    return client.send(req, HttpResponse.BodyHandlers.ofString()).body();
  }

  public static void main(String[] args) throws Exception {
    var server = HttpServer.create(new InetSocketAddress(8080), 0);
    server.createContext("/healthz", ex -> { ex.sendResponseHeaders(200, 2); ex.getResponseBody().write("ok".getBytes()); ex.close(); });
    server.createContext("/api/stock", ex -> { ex.sendResponseHeaders(200, 2); ex.getResponseBody().write("42".getBytes()); ex.close(); });
    server.createContext("/api/orders", ex -> {
      try {
        var stock = get("/api/stock").getBytes();
        ex.sendResponseHeaders(200, stock.length); ex.getResponseBody().write(stock);
      } catch (Exception e) { ex.sendResponseHeaders(500, -1); }
      ex.close();
    });
    server.setExecutor(Executors.newCachedThreadPool()); // /api/orders calls back into this server
    server.start();
    for (int i = 0; i < 10; i++) get("/healthz");
    for (int i = 0; i < 3; i++) get("/api/orders");
    Thread.sleep(4000); // let the batch processor and the metric reader export
    System.exit(0);
  }
}
