package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.RoleRequest;
import es.unex.cume.gestodered.service.RoleRequestService;
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
    public String createGuestRequest(
            @ModelAttribute RoleRequest roleRequest,
            @RequestParam(defaultValue = "") String password,
            @RequestParam(defaultValue = "") String confirmPassword,
            @RequestParam(defaultValue = "guest") String returnTo,
            RedirectAttributes redirectAttributes) {
        try {
            roleRequestService.createGuestRequest(roleRequest, password, confirmPassword);
            redirectAttributes.addFlashAttribute("requestSuccess", "Solicitud enviada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("requestError", exception.getMessage());
        }

        return redirectByOrigin(returnTo);
    }

    @PostMapping("/guest/role-requests/status")
    public String findGuestRequestStatus(
            @RequestParam(defaultValue = "") String identifier,
            @RequestParam(defaultValue = "guest") String returnTo,
            RedirectAttributes redirectAttributes) {
        try {
            roleRequestService.findGuestRequestByIdentifier(identifier)
                    .ifPresentOrElse(
                            request -> {
                                redirectAttributes.addFlashAttribute("statusSuccess", statusLabel(request.getStatus()));
                                redirectAttributes.addFlashAttribute("statusClass", statusClass(request.getStatus()));
                            },
                            () -> redirectAttributes.addFlashAttribute("statusError", "No se ha encontrado ninguna solicitud para esos datos")
                    );
        } catch (IllegalArgumentException exception) {
            redirectAttributes.addFlashAttribute("statusError", exception.getMessage());
        }

        return redirectByOrigin(returnTo);
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
