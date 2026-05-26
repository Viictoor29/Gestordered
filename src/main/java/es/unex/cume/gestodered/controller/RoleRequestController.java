package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.RoleRequest;
import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import es.unex.cume.gestodered.service.RoleRequestService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class RoleRequestController {

    private final RoleRequestService roleRequestService;
    private final UserRepository userRepository;

    public RoleRequestController(RoleRequestService roleRequestService, UserRepository userRepository) {
        this.roleRequestService = roleRequestService;
        this.userRepository = userRepository;
    }

    @PostMapping("/guest/role-requests")
    public Object createGuestRequest(
            @ModelAttribute RoleRequest roleRequest,
            @RequestParam(defaultValue = "") String password,
            @RequestParam(defaultValue = "") String confirmPassword,
            @RequestParam(defaultValue = "guest") String returnTo,
            HttpServletRequest request,
            RedirectAttributes redirectAttributes) {
        try {
            roleRequestService.createGuestRequest(roleRequest, password, confirmPassword);
            if (wantsJson(request)) {
                return ResponseEntity.ok(Map.of(
                        "ok", true,
                        "message", "Solicitud enviada correctamente.",
                        "feedbackClass", "is-success"
                ));
            }
            redirectAttributes.addFlashAttribute("requestSuccess", "Solicitud enviada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            if (wantsJson(request)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "ok", false,
                        "message", messageOrDefault(exception, "No se pudo enviar la solicitud."),
                        "feedbackClass", "is-error"
                ));
            }
            redirectAttributes.addFlashAttribute("requestError", exception.getMessage());
        }

        return redirectByOrigin(returnTo);
    }

    @PostMapping("/dashboard/role-requests")
    public String createOperatorRequest(
            @RequestParam(defaultValue = "") String reason,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            User user = requireOperator(authentication);
            roleRequestService.createRequestForUser(user, "ADMIN", reason);
            redirectAttributes.addFlashAttribute("operatorRequestSuccess", "Solicitud enviada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("operatorRequestError", messageOrDefault(exception, "No se pudo enviar la solicitud."));
        } catch (SecurityException exception) {
            redirectAttributes.addFlashAttribute("operatorRequestError", "No tienes permisos para enviar esta solicitud.");
        }

        return "redirect:/dashboard/topology";
    }


    @PostMapping("/admin/role-requests/{id}/approve")
    public String approveRoleRequest(
            @PathVariable String id,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            User reviewer = requireAdmin(authentication);
            roleRequestService.approveRequest(id, reviewer.getId());
            redirectAttributes.addFlashAttribute("adminRequestSuccess", "Solicitud aprobada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("adminRequestError", messageOrDefault(exception, "No se pudo aprobar la solicitud."));
        } catch (SecurityException exception) {
            redirectAttributes.addFlashAttribute("adminRequestError", "No tienes permisos para revisar solicitudes.");
        }

        return "redirect:/dashboard/admin#requests-admin";
    }

    @PostMapping("/admin/role-requests/{id}/reject")
    public String rejectRoleRequest(
            @PathVariable String id,
            @RequestParam(defaultValue = "") String rejectionReason,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            User reviewer = requireAdmin(authentication);
            roleRequestService.rejectRequest(id, reviewer.getId(), rejectionReason);
            redirectAttributes.addFlashAttribute("adminRequestSuccess", "Solicitud rechazada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("adminRequestError", messageOrDefault(exception, "No se pudo rechazar la solicitud."));
        } catch (SecurityException exception) {
            redirectAttributes.addFlashAttribute("adminRequestError", "No tienes permisos para revisar solicitudes.");
        }

        return "redirect:/dashboard/admin#requests-admin";
    }

    @PostMapping("/guest/role-requests/status")
    public Object findGuestRequestStatus(
            @RequestParam(defaultValue = "") String identifier,
            @RequestParam(defaultValue = "guest") String returnTo,
            HttpServletRequest request,
            RedirectAttributes redirectAttributes) {
        try {
            var roleRequest = roleRequestService.findGuestRequestByIdentifier(identifier);
            if (wantsJson(request)) {
                if (roleRequest.isPresent()) {
                    RoleRequest requestStatus = roleRequest.get();
                    String status = requestStatus.getStatus();
                    return ResponseEntity.ok(Map.of(
                            "ok", true,
                            "message", statusMessage(requestStatus),
                            "feedbackClass", statusClass(status)
                    ));
                }

                return ResponseEntity.status(404).body(Map.of(
                        "ok", false,
                        "message", "No se ha encontrado ninguna solicitud para esos datos",
                        "feedbackClass", "is-error"
                ));
            }

            roleRequest.ifPresentOrElse(
                    requestStatus -> {
                        redirectAttributes.addFlashAttribute("statusSuccess", statusMessage(requestStatus));
                        redirectAttributes.addFlashAttribute("statusClass", statusClass(requestStatus.getStatus()));
                    },
                    () -> redirectAttributes.addFlashAttribute("statusError", "No se ha encontrado ninguna solicitud para esos datos")
            );
        } catch (IllegalArgumentException exception) {
            if (wantsJson(request)) {
                return ResponseEntity.badRequest().body(Map.of(
                        "ok", false,
                        "message", messageOrDefault(exception, "No se pudo consultar la solicitud."),
                        "feedbackClass", "is-error"
                ));
            }
            redirectAttributes.addFlashAttribute("statusError", exception.getMessage());
        }

        return redirectByOrigin(returnTo);
    }

    private boolean wantsJson(HttpServletRequest request) {
        String requestedWith = request.getHeader("X-Requested-With");
        String accept = request.getHeader("Accept");
        return "XMLHttpRequest".equalsIgnoreCase(requestedWith)
                || (accept != null && accept.contains("application/json"));
    }

    private String messageOrDefault(Exception exception, String fallback) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? fallback
                : exception.getMessage();
    }

    private String redirectByOrigin(String returnTo) {
        if ("index".equals(returnTo)) {
            return "redirect:/index";
        }

        return "redirect:/guest";
    }

    private String statusLabel(String status) {
        if (RoleRequestService.STATUS_APPROVED.equals(status)) {
            return "Aprobada";
        }

        if (RoleRequestService.STATUS_REJECTED.equals(status)) {
            return "Rechazada";
        }

        return "Pendiente";
    }

    private String statusMessage(RoleRequest request) {
        String label = "Estado: " + statusLabel(request.getStatus());

        if (RoleRequestService.STATUS_REJECTED.equals(request.getStatus())
                && request.getRejectionReason() != null
                && !request.getRejectionReason().isBlank()) {
            return label + ". Justificacion: " + request.getRejectionReason();
        }

        return label;
    }

    private String statusClass(String status) {
        if (RoleRequestService.STATUS_APPROVED.equals(status)) {
            return "is-success";
        }

        if (RoleRequestService.STATUS_REJECTED.equals(status)) {
            return "is-error";
        }

        return "is-pending";
    }

    private User requireAdmin(Authentication authentication) {
        String username = authentication == null ? "" : authentication.getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Usuario no encontrado"));
        String role = user.getRole() == null ? "" : user.getRole().replace("ROLE_", "").toUpperCase();

        if (!"ADMIN".equals(role)) {
            throw new SecurityException("Permisos insuficientes");
        }

        return user;
    }

    private User requireOperator(Authentication authentication) {
        String username = authentication == null ? "" : authentication.getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Usuario no encontrado"));
        String role = user.getRole() == null ? "" : user.getRole().replace("ROLE_", "").toUpperCase();

        if (!"OPERATOR".equals(role)) {
            throw new SecurityException("Permisos insuficientes");
        }

        return user;
    }
}
