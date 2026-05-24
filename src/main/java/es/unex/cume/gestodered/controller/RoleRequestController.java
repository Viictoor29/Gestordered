package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.RoleRequest;
import es.unex.cume.gestodered.service.RoleRequestService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class RoleRequestController {

    private final RoleRequestService roleRequestService;

    public RoleRequestController(RoleRequestService roleRequestService) {
        this.roleRequestService = roleRequestService;
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
                    String status = roleRequest.get().getStatus();
                    return ResponseEntity.ok(Map.of(
                            "ok", true,
                            "message", "Estado: " + statusLabel(status),
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
                        redirectAttributes.addFlashAttribute("statusSuccess", statusLabel(requestStatus.getStatus()));
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

    private String statusClass(String status) {
        if (RoleRequestService.STATUS_APPROVED.equals(status)) {
            return "is-success";
        }

        if (RoleRequestService.STATUS_REJECTED.equals(status)) {
            return "is-error";
        }

        return "is-pending";
    }
}
