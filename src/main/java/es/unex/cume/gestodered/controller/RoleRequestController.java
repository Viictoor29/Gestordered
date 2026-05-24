package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.RoleRequest;
import es.unex.cume.gestodered.service.RoleRequestService;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class RoleRequestController {

    private final RoleRequestService roleRequestService;

    public RoleRequestController(RoleRequestService roleRequestService) {
        this.roleRequestService = roleRequestService;
    }

    @PostMapping("/guest/role-requests")
    public String createGuestRequest(@ModelAttribute RoleRequest roleRequest, RedirectAttributes redirectAttributes) {
        try {
            roleRequest.setCurrentRole("GUEST");
            roleRequestService.createRequest(roleRequest);
            redirectAttributes.addFlashAttribute("requestSuccess", "Solicitud enviada correctamente.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("requestError", exception.getMessage());
        }

        return "redirect:/guest";
    }
}
