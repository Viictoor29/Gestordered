package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.User;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class DashboardService {

    private final UserProfileService userProfileService;
    private final OperatorService operatorService;
    private final TopologyService topologyService;
    private final RoleRequestService roleRequestService;

    public DashboardService(
            UserProfileService userProfileService,
            OperatorService operatorService,
            TopologyService topologyService,
            RoleRequestService roleRequestService) {
        this.userProfileService = userProfileService;
        this.operatorService = operatorService;
        this.topologyService = topologyService;
        this.roleRequestService = roleRequestService;
    }

    public Map<String, Object> buildAttributes(Authentication authentication, DashboardQuery query) {
        User user = userProfileService.findDashboardUser(authentication);
        String role = userProfileService.normalizeRole(user.getRole());
        String displayName = userProfileService.displayName(user);

        Map<String, Object> attributes = new LinkedHashMap<>();
        attributes.put("user", user);
        attributes.put("role", role);
        attributes.put("roleLabel", roleLabel(role));
        attributes.put("isAdmin", "ADMIN".equals(role));
        attributes.put("activeSection", normalizeSection(query.section(), role));
        attributes.put("displayName", displayName);
        attributes.put("avatarInitial", displayName.substring(0, 1).toUpperCase());
        attributes.put("dashboardTitle", dashboardTitle(role));
        attributes.put("dashboardSubtitle", dashboardSubtitle(role));
        attributes.put("topologyTitle", topologyTitle(role));
        attributes.put("topologySubtitle", topologySubtitle(role));
        attributes.put("requestStatus", query.requestStatus());
        attributes.put("requestedRole", query.requestedRole());
        attributes.put("currentRole", query.currentRole());
        attributes.put("requestSearch", query.requestSearch());
        attributes.put("operatorId", query.operatorId());

        if ("ADMIN".equals(role)) {
            addAdminAttributes(attributes, query);
        } else {
            addOperatorAttributes(attributes, user);
        }
        return attributes;
    }

    private void addAdminAttributes(Map<String, Object> attributes, DashboardQuery query) {
        var roleRequests = roleRequestService.findFiltered(
                query.requestStatus(), query.requestedRole(), query.currentRole(), query.requestSearch());
        var operators = operatorService.findOperators();
        attributes.put("roleRequests", roleRequests);
        attributes.put("pendingRoleRequests", roleRequestService.findPending().size());
        attributes.put("visibleRoleRequests", roleRequests.size());
        attributes.put("operators", operators);
        attributes.put("selectedOperator", operators.stream()
                .filter(operator -> operator.getId() != null && operator.getId().equals(query.operatorId()))
                .findFirst()
                .orElse(null));
        attributes.put("topologies", topologyService.findTopologyViews());
    }

    private void addOperatorAttributes(Map<String, Object> attributes, User user) {
        var roleRequests = roleRequestService.findRequestsForUser(user).stream()
                .sorted(Comparator.comparing(
                        request -> request.getCreatedAt() == null ? Instant.EPOCH : request.getCreatedAt(),
                        Comparator.reverseOrder()))
                .toList();
        attributes.put("roleRequests", List.of());
        attributes.put("userRoleRequests", roleRequests);
        attributes.put("hasPendingUserRoleRequest", roleRequests.stream()
                .anyMatch(request -> RoleRequestService.STATUS_PENDING.equals(request.getStatus())));
        attributes.put("pendingRoleRequests", 0);
        attributes.put("visibleRoleRequests", 0);
        attributes.put("operators", List.of());
        attributes.put("selectedOperator", null);
        attributes.put("topologies", List.of());
    }

    private String normalizeSection(String section, String role) {
        if (section == null || section.isBlank()) {
            return "network";
        }
        String normalized = section.toLowerCase();
        if ("network".equals(normalized) || "profile".equals(normalized)) {
            return normalized;
        }
        if ("topology".equals(normalized)) {
            return "network";
        }
        if ("ADMIN".equals(role)
                && ("admin".equals(normalized) || "operators".equals(normalized) || "topologies".equals(normalized))) {
            return normalized;
        }
        return "network";
    }

    private String roleLabel(String role) {
        return "ADMIN".equals(role) ? "Administrador" : "Operador";
    }

    private String dashboardTitle(String role) {
        return "ADMIN".equals(role) ? "Panel de administrador" : "Panel de operador";
    }

    private String dashboardSubtitle(String role) {
        return "ADMIN".equals(role) ? "Gestion, usuarios y red" : "Operacion y monitorizacion de red";
    }

    private String topologyTitle(String role) {
        return "ADMIN".equals(role) ? "Topolog\u00eda y control" : "Topolog\u00eda de red";
    }

    private String topologySubtitle(String role) {
        return "ADMIN".equals(role) ? "Vista administrativa" : "Vista operativa";
    }

    public record DashboardQuery(
            String section,
            String requestStatus,
            String requestedRole,
            String currentRole,
            String requestSearch,
            String operatorId) {
    }
}
