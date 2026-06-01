package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.service.DashboardService;
import es.unex.cume.gestodered.service.DashboardService.DashboardQuery;
import es.unex.cume.gestodered.service.OperatorService;
import es.unex.cume.gestodered.service.OperatorService.OperatorCreateRequest;
import es.unex.cume.gestodered.service.TopologyService;
import es.unex.cume.gestodered.service.UserProfileService;
import es.unex.cume.gestodered.service.UserProfileService.ProfileUpdateRequest;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class DashboardController {

    private final DashboardService dashboardService;
    private final UserProfileService userProfileService;
    private final OperatorService operatorService;
    private final TopologyService topologyService;

    public DashboardController(
            DashboardService dashboardService,
            UserProfileService userProfileService,
            OperatorService operatorService,
            TopologyService topologyService) {
        this.dashboardService = dashboardService;
        this.userProfileService = userProfileService;
        this.operatorService = operatorService;
        this.topologyService = topologyService;
    }

    @GetMapping({"/dashboard", "/dashboard/{section}"})
    public String dashboard(
            Authentication authentication,
            @PathVariable(required = false) String section,
            @RequestParam(defaultValue = "") String requestStatus,
            @RequestParam(defaultValue = "") String requestedRole,
            @RequestParam(defaultValue = "") String currentRole,
            @RequestParam(defaultValue = "") String requestSearch,
            @RequestParam(defaultValue = "") String operatorId,
            Model model) {
        model.addAllAttributes(dashboardService.buildAttributes(
                authentication,
                new DashboardQuery(section, requestStatus, requestedRole, currentRole, requestSearch, operatorId)));
        return "dashboard";
    }

    @PostMapping("/dashboard/profile")
    public String updateProfile(
            Authentication authentication,
            @RequestParam(defaultValue = "") String fullName,
            @RequestParam(defaultValue = "") String username,
            @RequestParam(defaultValue = "") String email,
            @RequestParam(defaultValue = "") String dni,
            @RequestParam(defaultValue = "") String phone,
            @RequestParam(defaultValue = "") String currentPassword,
            @RequestParam(defaultValue = "") String newPassword,
            @RequestParam(defaultValue = "") String confirmPassword,
            RedirectAttributes redirectAttributes) {
        try {
            userProfileService.updateProfile(authentication, new ProfileUpdateRequest(
                    fullName, username, email, dni, phone, currentPassword, newPassword, confirmPassword));
            redirectAttributes.addFlashAttribute("profileSuccess", "Perfil actualizado correctamente.");
        } catch (DuplicateKeyException exception) {
            redirectAttributes.addFlashAttribute("profileError", "Ya existe otro usuario con alguno de esos datos.");
        } catch (IllegalArgumentException | IllegalStateException exception) {
            redirectAttributes.addFlashAttribute("profileError", messageOrDefault(exception, "No se pudo actualizar el perfil."));
        }
        return "redirect:/dashboard/profile";
    }

    @PostMapping("/dashboard/operators")
    public String createOperator(
            Authentication authentication,
            @RequestParam(defaultValue = "") String fullName,
            @RequestParam(defaultValue = "") String username,
            @RequestParam(defaultValue = "") String email,
            @RequestParam(defaultValue = "") String dni,
            @RequestParam(defaultValue = "") String phone,
            @RequestParam(defaultValue = "") String password,
            @RequestParam(defaultValue = "") String confirmPassword,
            RedirectAttributes redirectAttributes) {
        try {
            operatorService.createOperator(authentication, new OperatorCreateRequest(
                    fullName, username, email, dni, phone, password, confirmPassword));
            redirectAttributes.addFlashAttribute("operatorSuccess", "Operador creado correctamente.");
        } catch (DuplicateKeyException exception) {
            redirectAttributes.addFlashAttribute("operatorError", "Ya existe otro operador con alguno de esos datos.");
        } catch (IllegalArgumentException | IllegalStateException | SecurityException exception) {
            redirectAttributes.addFlashAttribute("operatorError", messageOrDefault(exception, "No se pudo crear el operador."));
        }
        return "redirect:/dashboard/operators";
    }

    @PostMapping("/dashboard/operators/{id}/delete")
    public String deleteOperator(
            @PathVariable String id,
            @RequestParam(defaultValue = "") String adminPassword,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            long deletedRequests = operatorService.deleteOperator(authentication, id, adminPassword);
            redirectAttributes.addFlashAttribute(
                    "operatorSuccess",
                    "Operador eliminado correctamente. Peticiones eliminadas: " + deletedRequests + ".");
        } catch (IllegalArgumentException | IllegalStateException | SecurityException exception) {
            redirectAttributes.addFlashAttribute("operatorDeleteError", messageOrDefault(exception, "No se pudo eliminar el operador."));
            redirectAttributes.addFlashAttribute("operatorDeleteAction", "/dashboard/operators/" + id + "/delete");
            operatorService.findDisplayName(id)
                    .ifPresent(name -> redirectAttributes.addFlashAttribute("operatorDeleteName", name));
        }
        return "redirect:/dashboard/operators";
    }

    @PostMapping("/dashboard/topologies/upload")
    public String uploadTopology(
            Authentication authentication,
            @RequestParam(defaultValue = "") String name,
            @RequestParam(defaultValue = "") String description,
            @RequestParam("file") MultipartFile file,
            RedirectAttributes redirectAttributes) {
        try {
            topologyService.uploadTopology(authentication, name, description, file);
            redirectAttributes.addFlashAttribute("topologySuccess", "Topologia subida correctamente.");
        } catch (DuplicateKeyException exception) {
            redirectAttributes.addFlashAttribute("topologyError", "Ya existe una topologia con ese nombre.");
        } catch (Exception exception) {
            redirectAttributes.addFlashAttribute("topologyError", messageOrDefault(exception, "No se pudo subir la topologia."));
        }
        return "redirect:/dashboard/topologies";
    }

    @PostMapping(
            value = "/dashboard/topologies/save",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> saveTopology(
            @RequestBody(required = false) Map<String, Object> body,
            Authentication authentication) {
        try {
            topologyService.saveTopology(authentication, body);
            return ResponseEntity.ok(Map.of("ok", true, "message", "Topologia guardada correctamente."));
        } catch (DuplicateKeyException exception) {
            return ResponseEntity.badRequest().body(Map.of("ok", false, "error", "Ya existe una topologia con ese nombre."));
        } catch (Exception exception) {
            return ResponseEntity.badRequest().body(Map.of(
                    "ok", false, "error", messageOrDefault(exception, "No se pudo guardar la topologia.")));
        }
    }

    @GetMapping("/dashboard/topologies/{id}/download")
    public ResponseEntity<byte[]> downloadTopology(@PathVariable String id, Authentication authentication) {
        var download = topologyService.downloadTopology(authentication, id);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(download.filename()).build().toString())
                .body(download.body());
    }

    @PostMapping("/dashboard/topologies/{id}/delete")
    public String deleteTopology(
            @PathVariable String id,
            @RequestParam(defaultValue = "") String adminPassword,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            topologyService.deleteTopology(authentication, id, adminPassword);
            redirectAttributes.addFlashAttribute("topologySuccess", "Topologia eliminada correctamente.");
        } catch (IllegalArgumentException | SecurityException exception) {
            redirectAttributes.addFlashAttribute("topologyDeleteError", messageOrDefault(exception, "No se pudo eliminar la topologia."));
            redirectAttributes.addFlashAttribute("topologyDeleteAction", "/dashboard/topologies/" + id + "/delete");
            topologyService.findName(id)
                    .ifPresent(name -> redirectAttributes.addFlashAttribute("topologyDeleteName", name));
        }
        return "redirect:/dashboard/topologies";
    }

    private String messageOrDefault(Exception exception, String fallback) {
        return exception.getMessage() == null || exception.getMessage().isBlank() ? fallback : exception.getMessage();
    }
}
