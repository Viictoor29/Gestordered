package es.unex.cume.gestodered.service;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

@Service
public class NetworkApiClient {

    private final RestClient restClient;
    private final String ryuApiUrl;
    private final String mininetApiUrl;

    public NetworkApiClient(
            @Value("${gestordered.ryu-api-url:http://127.0.0.1:8080}") String ryuApiUrl,
            @Value("${gestordered.mininet-api-url:http://127.0.0.1:8081}") String mininetApiUrl) {
        this.restClient = RestClient.builder().build();
        this.ryuApiUrl = trimTrailingSlash(ryuApiUrl);
        this.mininetApiUrl = trimTrailingSlash(mininetApiUrl);
    }

    public ResponseEntity<String> ryu(HttpMethod method, String path, String body, HttpServletRequest request) {
        return exchange(ryuApiUrl, method, path, body, request);
    }

    public ResponseEntity<String> mininet(HttpMethod method, String path, String body, HttpServletRequest request) {
        return exchange(mininetApiUrl, method, path, body, request);
    }

    public ResponseEntity<String> absolute(String baseUrl, HttpMethod method, String path, String body) {
        return exchange(trimTrailingSlash(baseUrl), method, path, body, null);
    }

    private ResponseEntity<String> exchange(
            String baseUrl,
            HttpMethod method,
            String path,
            String body,
            HttpServletRequest request) {
        URI uri = buildUri(baseUrl, path, request);

        return restClient.method(method)
                .uri(uri)
                .contentType(MediaType.APPLICATION_JSON)
                .accept(MediaType.APPLICATION_JSON)
                .body(body == null || body.isBlank() ? "{}" : body)
                .exchange((clientRequest, clientResponse) -> {
                    String responseBody;
                    try {
                        responseBody = StreamUtils.copyToString(clientResponse.getBody(), StandardCharsets.UTF_8);
                    } catch (IOException exception) {
                        responseBody = "{\"ok\":false,\"error\":\"No se pudo leer la respuesta del servicio de red.\"}";
                    }

                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.APPLICATION_JSON);
                    return ResponseEntity.status(clientResponse.getStatusCode())
                            .headers(headers)
                            .body(responseBody);
                });
    }

    private URI buildUri(String baseUrl, String path, HttpServletRequest request) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(baseUrl + path);
        if (request != null && request.getQueryString() != null && !request.getQueryString().isBlank()) {
            builder.query(request.getQueryString());
        }

        return builder.build(true).toUri();
    }

    private String trimTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }

        return value.replaceAll("/+$", "");
    }
}
