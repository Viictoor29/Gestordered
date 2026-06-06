package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.service.NetworkApiClient;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.server.ResponseStatusException;

@Controller
public class NetworkApiController {

    // The frontend consumes several evolving network payloads, so this proxy deliberately preserves raw JSON responses.
    private static final Set<String> ADMIN_ROLES = Set.of("ADMIN");
    private static final Set<String> OPERATOR_ROLES = Set.of("ADMIN", "OPERATOR");

    private final NetworkApiClient networkApiClient;

    public NetworkApiController(NetworkApiClient networkApiClient) {
        this.networkApiClient = networkApiClient;
    }

    @GetMapping("/api/topology")
    public ResponseEntity<String> getTopology(
            @RequestParam(required = false) String serverUrl,
            HttpServletRequest request) {
        return ryu(serverUrl, HttpMethod.GET, "/api/topology", null, request);
    }

    @GetMapping("/guest/api/topology")
    public ResponseEntity<String> getGuestTopology(@RequestParam String serverUrl) {
        return networkApiClient.absolute(serverUrl, HttpMethod.GET, "/api/topology", null);
    }

    @GetMapping("/guest/api/mininet/status")
    public ResponseEntity<String> getGuestMininetStatus(@RequestParam String serverUrl) {
        return networkApiClient.absolute(serverUrl, HttpMethod.GET, "/api/mininet/status", null);
    }

    @GetMapping("/api/topology/export")
    public ResponseEntity<String> exportTopology(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/topology/export", null, request);
    }

    @PostMapping("/api/topology/validate")
    public ResponseEntity<String> validateTopology(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.POST, "/api/topology/validate", body, request);
    }

    @PostMapping("/api/topology/import")
    public ResponseEntity<String> importTopology(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.POST, "/api/topology/import", body, request);
    }

    @PostMapping("/api/controller/runtime/reset")
    public ResponseEntity<String> resetControllerRuntime(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.POST, "/api/controller/runtime/reset", body, request);
    }

    @GetMapping("/api/controller/status")
    public ResponseEntity<String> getControllerStatus(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/controller/status", null, request);
    }

    @GetMapping("/api/health")
    public ResponseEntity<String> getHealth(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/health", null, request);
    }

    @GetMapping("/api/health/summary")
    public ResponseEntity<String> getHealthSummary(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/health/summary", null, request);
    }

    @GetMapping("/api/switch/{dpid}/ports")
    public ResponseEntity<String> getSwitchPorts(
            @PathVariable String dpid,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/switch/" + dpid + "/ports", null, request);
    }

    @GetMapping("/api/switch/{dpid}/flows")
    public ResponseEntity<String> getSwitchFlows(
            @PathVariable String dpid,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/switch/" + dpid + "/flows", null, request);
    }

    @GetMapping("/api/stp/status")
    public ResponseEntity<String> getStpStatus(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/stp/status", null, request);
    }

    @PostMapping({
            "/api/links/disable",
            "/api/links/enable",
            "/api/links/loss",
            "/api/links/bandwidth",
            "/api/links/delay",
            "/api/links/tc/clear",
            "/api/links/forget",
            "/api/ports/disable",
            "/api/ports/enable",
            "/api/ports/loss",
            "/api/ports/bandwidth",
            "/api/ports/delay",
            "/api/ports/tc/clear",
            "/api/hosts/link/attach",
            "/api/hosts/link/detach",
            "/api/traffic/block-ip",
            "/api/traffic/unblock-ip",
            "/api/traffic/unblock-all-ips",
            "/api/traffic/ping",
            "/api/traffic/pingall",
            "/api/traffic/iperf"
    })
    public ResponseEntity<String> postRyuOperation(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.POST, request.getRequestURI(), body, request);
    }

    @GetMapping("/api/traffic/blocked-ips")
    public ResponseEntity<String> getBlockedIps(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.GET, "/api/traffic/blocked-ips", null, request);
    }

    @DeleteMapping("/api/hosts/forget/{mac}")
    public ResponseEntity<String> forgetHost(
            @PathVariable String mac,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return ryu(request.getParameter("serverUrl"), HttpMethod.DELETE, "/api/hosts/forget/" + mac, null, request);
    }

    @GetMapping("/api/mininet/status")
    public ResponseEntity<String> getMininetStatus(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return mininet(request.getParameter("serverUrl"), HttpMethod.GET, "/api/mininet/status", null, request);
    }

    @GetMapping("/api/mininet/topology/export")
    public ResponseEntity<String> exportMininetTopology(Authentication authentication, HttpServletRequest request) {
        requireRole(authentication, OPERATOR_ROLES);
        return mininet(request.getParameter("serverUrl"), HttpMethod.GET, "/api/mininet/topology/export", null, request);
    }

    @GetMapping("/api/admin/mininet/topology/export")
    public ResponseEntity<String> exportMininetTopologyFrom(
            @RequestParam String serverUrl,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.GET, "/api/mininet/topology/export", null);
    }

    @GetMapping("/api/admin/ryu/topology/export")
    public ResponseEntity<String> exportRyuTopologyFrom(
            @RequestParam String serverUrl,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.GET, "/api/topology/export", null);
    }

    @GetMapping("/api/admin/ryu/topology")
    public ResponseEntity<String> getRyuTopologyFrom(
            @RequestParam String serverUrl,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.GET, "/api/topology", null);
    }

    @PostMapping("/api/admin/ryu/topology/import")
    public ResponseEntity<String> importRyuTopologyFrom(
            @RequestParam String serverUrl,
            @RequestBody(required = false) String body,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.POST, "/api/topology/import", body);
    }

    @PostMapping("/api/admin/mininet/topology/apply")
    public ResponseEntity<String> applyMininetTopologyFrom(
            @RequestParam String serverUrl,
            @RequestBody(required = false) String body,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.POST, "/api/mininet/topology/apply", body);
    }

    @PostMapping({
            "/api/admin/mininet/hosts",
            "/api/admin/mininet/switches",
            "/api/admin/mininet/links",
            "/api/admin/mininet/links/add",
            "/api/admin/mininet/links/delete",
            "/api/admin/mininet/topology/clear"
    })
    public ResponseEntity<String> postAdminMininetOperationFrom(
            @RequestParam String serverUrl,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.POST, adminMininetPath(request), body);
    }

    @DeleteMapping({
            "/api/admin/mininet/links",
            "/api/admin/mininet/hosts/{name}",
            "/api/admin/mininet/switches/{name}"
    })
    public ResponseEntity<String> deleteAdminMininetOperationFrom(
            @RequestParam String serverUrl,
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.DELETE, adminMininetPath(request), body);
    }

    @PostMapping("/api/admin/ryu/controller/runtime/reset")
    public ResponseEntity<String> resetRyuRuntimeFrom(
            @RequestParam String serverUrl,
            @RequestBody(required = false) String body,
            Authentication authentication) {
        requireRole(authentication, ADMIN_ROLES);
        return networkApiClient.absolute(serverUrl, HttpMethod.POST, "/api/controller/runtime/reset", body);
    }

    @PostMapping({
            "/api/mininet/topology/apply",
            "/api/mininet/topology/clear",
            "/api/mininet/hosts",
            "/api/mininet/switches",
            "/api/mininet/links",
            "/api/mininet/links/add",
            "/api/mininet/links/delete",
            "/api/mininet/pingall"
    })
    public ResponseEntity<String> postMininetOperation(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return mininet(request.getParameter("serverUrl"), HttpMethod.POST, request.getRequestURI(), body, request);
    }

    @DeleteMapping({
            "/api/mininet/links",
            "/api/mininet/hosts/{name}",
            "/api/mininet/switches/{name}"
    })
    public ResponseEntity<String> deleteMininetOperation(
            @RequestBody(required = false) String body,
            Authentication authentication,
            HttpServletRequest request) {
        requireRole(authentication, ADMIN_ROLES);
        return mininet(request.getParameter("serverUrl"), HttpMethod.DELETE, request.getRequestURI(), body, request);
    }

    private ResponseEntity<String> ryu(
            String serverUrl,
            HttpMethod method,
            String path,
            String body,
            HttpServletRequest request) {
        if (serverUrl != null && !serverUrl.isBlank()) {
            return networkApiClient.absolute(serverUrl, method, path, body);
        }

        return networkApiClient.ryu(method, path, body, request);
    }

    private ResponseEntity<String> mininet(
            String serverUrl,
            HttpMethod method,
            String path,
            String body,
            HttpServletRequest request) {
        if (serverUrl != null && !serverUrl.isBlank()) {
            return networkApiClient.absolute(serverUrl, method, path, body);
        }

        return networkApiClient.mininet(method, path, body, request);
    }

    private void requireRole(Authentication authentication, Set<String> roles) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesion para usar esta funcion.");
        }

        boolean hasRole = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority().replace("ROLE_", ""))
                .anyMatch(roles::contains);

        if (!hasRole) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para usar esta funcion.");
        }
    }

    private String adminMininetPath(HttpServletRequest request) {
        return request.getRequestURI().replaceFirst("^/api/admin", "/api");
    }
}
