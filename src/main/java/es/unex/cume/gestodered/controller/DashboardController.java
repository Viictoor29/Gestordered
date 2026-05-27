package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.model.Topology;
import es.unex.cume.gestodered.data.repository.TopologyRepository;
import es.unex.cume.gestodered.data.repository.UserRepository;
import es.unex.cume.gestodered.service.RoleRequestService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

@Controller
public class DashboardController {

    private final UserRepository userRepository;
    private final TopologyRepository topologyRepository;
    private final RoleRequestService roleRequestService;
    private final BCryptPasswordEncoder passwordEncoder;

    public DashboardController(
            UserRepository userRepository,
            TopologyRepository topologyRepository,
            RoleRequestService roleRequestService,
            BCryptPasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.topologyRepository = topologyRepository;
        this.roleRequestService = roleRequestService;
        this.passwordEncoder = passwordEncoder;
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
        String username = authentication == null ? "" : authentication.getName();

        User user = userRepository.findByUsername(username).orElseGet(() -> {
            User usr = new User();
            usr.setUsername(username);
            usr.setRole("OPERATOR");
            usr.setEnabled(true);
            return usr;
        });

        String role = normalizeRole(user.getRole());
        String displayName = displayName(user);
        String activeSection = normalizeSection(section, role);

        model.addAttribute("user", user);
        model.addAttribute("role", role);
        model.addAttribute("roleLabel", roleLabel(role));
        model.addAttribute("isAdmin", "ADMIN".equals(role));
        model.addAttribute("activeSection", activeSection);
        model.addAttribute("displayName", displayName);
        model.addAttribute("avatarInitial", displayName.substring(0, 1).toUpperCase());
        model.addAttribute("dashboardTitle", dashboardTitle(role));
        model.addAttribute("dashboardSubtitle", dashboardSubtitle(role));
        model.addAttribute("topologyTitle", topologyTitle(role));
        model.addAttribute("topologySubtitle", topologySubtitle(role));
        model.addAttribute("requestStatus", requestStatus);
        model.addAttribute("requestedRole", requestedRole);
        model.addAttribute("currentRole", currentRole);
        model.addAttribute("requestSearch", requestSearch);
        model.addAttribute("operatorId", operatorId);

        if ("ADMIN".equals(role)) {
            var roleRequests = roleRequestService.findFiltered(requestStatus, requestedRole, currentRole, requestSearch);
            var operators = userRepository.findAll().stream()
                    .filter(candidate -> "OPERATOR".equals(normalizeRole(candidate.getRole())))
                    .sorted(Comparator.comparing(this::displayName, String.CASE_INSENSITIVE_ORDER))
                    .toList();
            model.addAttribute("roleRequests", roleRequests);
            model.addAttribute("pendingRoleRequests", roleRequestService.findPending().size());
            model.addAttribute("visibleRoleRequests", roleRequests.size());
            model.addAttribute("operators", operators);
            model.addAttribute("selectedOperator", operators.stream()
                    .filter(operator -> operator.getId() != null && operator.getId().equals(operatorId))
                    .findFirst()
                    .orElse(null));
            model.addAttribute("topologies", topologyRepository.findAll().stream()
                    .sorted(Comparator.comparing(
                            topology -> topology.getUpdatedAt() == null ? Instant.EPOCH : topology.getUpdatedAt(),
                            Comparator.reverseOrder()))
                    .map(this::toTopologyView)
                    .toList());
        } else {
            var userRoleRequests = roleRequestService.findRequestsForUser(user).stream()
                    .sorted(Comparator.comparing(
                            request -> request.getCreatedAt() == null ? Instant.EPOCH : request.getCreatedAt(),
                            Comparator.reverseOrder()))
                    .toList();
            model.addAttribute("roleRequests", List.of());
            model.addAttribute("userRoleRequests", userRoleRequests);
            model.addAttribute("hasPendingUserRoleRequest", userRoleRequests.stream()
                    .anyMatch(request -> RoleRequestService.STATUS_PENDING.equals(request.getStatus())));
            model.addAttribute("pendingRoleRequests", 0);
            model.addAttribute("visibleRoleRequests", 0);
            model.addAttribute("operators", List.of());
            model.addAttribute("selectedOperator", null);
            model.addAttribute("topologies", List.of());
        }

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
            String currentUsername = authentication == null ? "" : authentication.getName();
            User user = userRepository.findByUsername(currentUsername)
                    .orElseThrow(() -> new IllegalStateException("No se ha encontrado el usuario actual."));

            String cleanFullName = normalizeSpaces(fullName);
            String cleanUsername = normalizeUsername(username);
            String cleanEmail = normalizeEmail(email);
            String cleanDni = normalizeDni(dni);
            String cleanPhone = normalizePhone(phone);

            validateProfile(user, cleanFullName, cleanUsername, cleanEmail, cleanDni, cleanPhone);
            validatePasswordChange(user, currentPassword, newPassword, confirmPassword);

            user.setFullName(cleanFullName);
            user.setUsername(cleanUsername);
            user.setEmail(cleanEmail);
            user.setDni(cleanDni);
            user.setPhone(cleanPhone);
            if (hasPasswordChange(currentPassword, newPassword, confirmPassword)) {
                user.setPasswordHash(passwordEncoder.encode(newPassword));
            }
            user.setUpdatedAt(Instant.now());

            userRepository.save(user);
            refreshAuthentication(authentication, user);
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
            requireAdmin(authentication);

            String cleanFullName = normalizeSpaces(fullName);
            String cleanUsername = normalizeUsername(username);
            String cleanEmail = normalizeEmail(email);
            String cleanDni = normalizeDni(dni);
            String cleanPhone = normalizePhone(phone);

            validateProfile(null, cleanFullName, cleanUsername, cleanEmail, cleanDni, cleanPhone);
            validateNewPassword(password, confirmPassword);

            User operator = new User();
            operator.setFullName(cleanFullName);
            operator.setUsername(cleanUsername);
            operator.setEmail(cleanEmail);
            operator.setDni(cleanDni);
            operator.setPhone(cleanPhone);
            operator.setPasswordHash(passwordEncoder.encode(password));
            operator.setRole("OPERATOR");
            operator.setEnabled(true);
            operator.setCreatedAt(Instant.now());
            operator.setUpdatedAt(Instant.now());

            userRepository.save(operator);
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
            User admin = requireAdmin(authentication);
            User operator = userRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado el operador."));
            validateCurrentPassword(admin, adminPassword);

            if (admin.getId() != null && admin.getId().equals(id)) {
                throw new IllegalStateException("No puedes borrar tu propio usuario.");
            }

            if (!"OPERATOR".equals(normalizeRole(operator.getRole()))) {
                throw new IllegalStateException("Solo puedes borrar operadores desde este apartado.");
            }

            long deletedRequests = roleRequestService.deleteRequestsForUser(operator);
            userRepository.delete(operator);
            redirectAttributes.addFlashAttribute(
                    "operatorSuccess",
                    "Operador eliminado correctamente. Peticiones eliminadas: " + deletedRequests + "."
            );
        } catch (IllegalArgumentException | IllegalStateException | SecurityException exception) {
            redirectAttributes.addFlashAttribute("operatorDeleteError", messageOrDefault(exception, "No se pudo eliminar el operador."));
            redirectAttributes.addFlashAttribute("operatorDeleteAction", "/dashboard/operators/" + id + "/delete");
            userRepository.findById(id)
                    .map(this::displayName)
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
            User admin = requireAdmin(authentication);
            if (file == null || file.isEmpty()) {
                throw new IllegalArgumentException("Selecciona un archivo JSON.");
            }

            Document payloadDocument = Document.parse(new String(file.getBytes(), StandardCharsets.UTF_8));
            Map<String, Object> payload = new LinkedHashMap<>(payloadDocument);
            Map<String, Object> topologyData = extractTopologyData(payload);
            String cleanName = normalizeTopologyName(name, payload, file.getOriginalFilename());
            String cleanDescription = normalizeTopologyDescription(description, payload);

            topologyRepository.findByName(cleanName).ifPresent(existing -> {
                throw new IllegalStateException("Ya existe una topologia con ese nombre.");
            });

            Topology topology = new Topology();
            topology.setName(cleanName);
            topology.setDescription(cleanDescription);
            topology.setData(topologyData);
            topology.setCreatedBy(admin.getId() != null && ObjectId.isValid(admin.getId()) ? new ObjectId(admin.getId()) : null);
            topology.setCreatedAt(Instant.now());
            topology.setUpdatedAt(Instant.now());

            topologyRepository.save(topology);
            redirectAttributes.addFlashAttribute("topologySuccess", "Topologia subida correctamente.");
        } catch (DuplicateKeyException exception) {
            redirectAttributes.addFlashAttribute("topologyError", "Ya existe una topologia con ese nombre.");
        } catch (Exception exception) {
            redirectAttributes.addFlashAttribute("topologyError", messageOrDefault(exception, "No se pudo subir la topologia."));
        }

        return "redirect:/dashboard/topologies";
    }

    @GetMapping("/dashboard/topologies/{id}/download")
    public ResponseEntity<byte[]> downloadTopology(@PathVariable String id, Authentication authentication) throws Exception {
        requireAdmin(authentication);
        Topology topology = topologyRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado la topologia."));

        byte[] body = toJsonBytes(topology.getData());
        String filename = sanitizeFilename(topology.getName()) + ".json";

        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(filename).build().toString())
                .body(body);
    }

    @PostMapping("/dashboard/topologies/{id}/delete")
    public String deleteTopology(
            @PathVariable String id,
            @RequestParam(defaultValue = "") String adminPassword,
            Authentication authentication,
            RedirectAttributes redirectAttributes) {
        try {
            User admin = requireAdmin(authentication);
            Topology topology = topologyRepository.findById(id)
                    .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado la topologia."));
            validateCurrentPassword(admin, adminPassword);
            topologyRepository.delete(topology);
            redirectAttributes.addFlashAttribute("topologySuccess", "Topologia eliminada correctamente.");
        } catch (IllegalArgumentException | SecurityException exception) {
            redirectAttributes.addFlashAttribute("topologyDeleteError", messageOrDefault(exception, "No se pudo eliminar la topologia."));
            redirectAttributes.addFlashAttribute("topologyDeleteAction", "/dashboard/topologies/" + id + "/delete");
            topologyRepository.findById(id)
                    .map(Topology::getName)
                    .ifPresent(name -> redirectAttributes.addFlashAttribute("topologyDeleteName", name));
        }

        return "redirect:/dashboard/topologies";
    }

    private String normalizeSection(String section, String role) {
        if (section == null || section.isBlank()) {
            return "network";
        }

        String normalized = section.toLowerCase();
        if ("network".equals(normalized)
                || "topology".equals(normalized)
                || "profile".equals(normalized)) {
            if ("topology".equals(normalized)) {
                return "network";
            }

            return normalized;
        }

        if ("ADMIN".equals(role) && "admin".equals(normalized)) {
            return normalized;
        }

        if ("ADMIN".equals(role) && "operators".equals(normalized)) {
            return normalized;
        }

        if ("ADMIN".equals(role) && "topologies".equals(normalized)) {
            return normalized;
        }

        return "network";
    }

    private TopologyView toTopologyView(Topology topology) {
        Map<String, Object> data = topology.getData() == null ? Map.of() : topology.getData();
        return new TopologyView(
                topology.getId(),
                topology.getName(),
                topology.getDescription(),
                topology.getCreatedAt(),
                topology.getUpdatedAt(),
                countTopologyNodes(data),
                countTopologyEdges(data),
                buildTopologyExport(topology).toJson());
    }

    private int countTopologyNodes(Map<String, Object> data) {
        Object topologyNodes = getNestedValue(data, "topology", "nodes");
        if (topologyNodes instanceof List<?> nodes) {
            return nodes.size();
        }

        Object mininetSwitches = getNestedValue(data, "mininet", "switches");
        Object mininetHosts = getNestedValue(data, "mininet", "hosts");
        int switches = mininetSwitches instanceof List<?> list ? list.size() : 0;
        int hosts = mininetHosts instanceof List<?> list ? list.size() : 0;
        if (switches + hosts > 0) {
            return switches + hosts;
        }

        return countNamedCollection(data, Set.of("nodes"));
    }

    private int countTopologyEdges(Map<String, Object> data) {
        Object topologyEdges = getNestedValue(data, "topology", "edges");
        if (topologyEdges instanceof List<?> edges) {
            return edges.size();
        }

        Object mininetLinks = getNestedValue(data, "mininet", "links");
        Object mininetHosts = getNestedValue(data, "mininet", "hosts");
        int switchLinks = mininetLinks instanceof List<?> links ? links.size() : 0;
        int hostLinks = countMininetHostLinks(mininetHosts);
        if (switchLinks + hostLinks > 0) {
            return switchLinks + hostLinks;
        }

        return countNamedCollection(data, Set.of("edges", "links"));
    }

    private int countMininetHostLinks(Object hostsValue) {
        if (!(hostsValue instanceof List<?> hosts)) {
            return 0;
        }

        return (int) hosts.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .filter(host -> hasValue(host.get("switch"))
                        || hasValue(host.get("switch_dpid"))
                        || hasValue(host.get("switch_port")))
                .count();
    }

    private boolean hasValue(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    private Object getNestedValue(Map<String, Object> data, String parentKey, String childKey) {
        Object parent = data.get(parentKey);
        if (parent instanceof Map<?, ?> map) {
            return map.get(childKey);
        }

        return null;
    }

    private int countNamedCollection(Object value, Set<String> keys) {
        if (value instanceof Map<?, ?> map) {
            for (String key : keys) {
                Object directValue = map.get(key);
                if (directValue instanceof List<?> list) {
                    return list.size();
                }
            }

            return map.values().stream()
                    .mapToInt(child -> countNamedCollection(child, keys))
                    .filter(count -> count > 0)
                    .findFirst()
                    .orElse(0);
        }

        if (value instanceof List<?> list) {
            return list.stream()
                    .mapToInt(child -> countNamedCollection(child, keys))
                    .filter(count -> count > 0)
                    .findFirst()
                    .orElse(0);
        }

        return 0;
    }

    private Document buildTopologyExport(Topology topology) {
        Document exportPayload = new Document();
        exportPayload.put("name", topology.getName());
        exportPayload.put("description", topology.getDescription());
        exportPayload.put("data", toBsonValue(topology.getData()));
        exportPayload.put("createdAt", topology.getCreatedAt() == null ? null : topology.getCreatedAt().toString());
        exportPayload.put("updatedAt", topology.getUpdatedAt() == null ? null : topology.getUpdatedAt().toString());
        return exportPayload;
    }

    private Object toBsonValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Document document = new Document();
            map.forEach((key, childValue) -> document.put(String.valueOf(key), toBsonValue(childValue)));
            return document;
        }

        if (value instanceof List<?> list) {
            return list.stream().map(this::toBsonValue).toList();
        }

        return value;
    }

    private byte[] toJsonBytes(Map<String, Object> data) {
        Object bsonValue = toBsonValue(data == null ? Map.of() : data);
        String json = bsonValue instanceof Document document ? document.toJson() : new Document("data", bsonValue).toJson();
        return json.getBytes(StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractTopologyData(Map<String, Object> payload) {
        Object exportedData = payload.get("data");
        if (exportedData instanceof Map<?, ?> data) {
            return (Map<String, Object>) data;
        }

        return payload;
    }

    private String normalizeTopologyName(String name, Map<String, Object> payload, String originalFilename) {
        String value = normalizeSpaces(name);
        if (value.isBlank() && payload.get("name") instanceof String payloadName) {
            value = normalizeSpaces(payloadName);
        }
        if (value.isBlank()) {
            value = filenameWithoutExtension(originalFilename);
        }
        if (value.length() < 3 || value.length() > 80) {
            throw new IllegalArgumentException("El nombre de la topologia debe tener entre 3 y 80 caracteres.");
        }

        return value;
    }

    private String normalizeTopologyDescription(String description, Map<String, Object> payload) {
        String value = normalizeSpaces(description);
        if (value.isBlank() && payload.get("description") instanceof String payloadDescription) {
            value = normalizeSpaces(payloadDescription);
        }

        return value.length() > 240 ? value.substring(0, 240) : value;
    }

    private String filenameWithoutExtension(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "topologia-importada";
        }

        String filename = originalFilename.replace("\\", "/");
        filename = filename.substring(filename.lastIndexOf('/') + 1);
        int dotIndex = filename.lastIndexOf('.');
        return normalizeSpaces(dotIndex > 0 ? filename.substring(0, dotIndex) : filename);
    }

    private String sanitizeFilename(String value) {
        String filename = value == null ? "topologia" : value.trim().toLowerCase(Locale.ROOT);
        filename = filename.replaceAll("[^a-z0-9._-]+", "-").replaceAll("^-+|-+$", "");
        return filename.isBlank() ? "topologia" : filename;
    }

    private String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "OPERATOR";
        }

        return role.replace("ROLE_", "").toUpperCase();
    }

    private String roleLabel(String role) {
        if ("ADMIN".equals(role)) {
            return "Administrador";
        }

        return "Operador";
    }

    private String dashboardTitle(String role) {
        if ("ADMIN".equals(role)) {
            return "Panel de administrador";
        }

        return "Panel de operador";
    }

    private String dashboardSubtitle(String role) {
        if ("ADMIN".equals(role)) {
            return "Gestion, usuarios y red";
        }

        return "Operacion y monitorizacion de red";
    }

    private String topologyTitle(String role) {
        if ("ADMIN".equals(role)) {
            return "Topología y control";
        }

        return "Topología de red";
    }

    private String topologySubtitle(String role) {
        if ("ADMIN".equals(role)) {
            return "Vista administrativa";
        }

        return "Vista operativa";
    }

    private String displayName(User user) {
        if (user.getFullName() != null && !user.getFullName().isBlank()) {
            return user.getFullName();
        }

        if (user.getUsername() != null && !user.getUsername().isBlank()) {
            return user.getUsername();
        }

        return "Usuario";
    }

    private void validateProfile(
            User currentUser,
            String fullName,
            String username,
            String email,
            String dni,
            String phone) {
        if (fullName.length() < 3 || fullName.length() > 120) {
            throw new IllegalArgumentException("El nombre completo debe tener entre 3 y 120 caracteres.");
        }

        if (!username.matches("^[A-Za-z0-9._-]{3,30}$")) {
            throw new IllegalArgumentException("El usuario debe tener entre 3 y 30 caracteres y solo puede usar letras, numeros, punto, guion o guion bajo.");
        }

        if (!email.matches("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$")) {
            throw new IllegalArgumentException("Introduce un email valido.");
        }

        if (!isValidDni(dni)) {
            throw new IllegalArgumentException("Introduce un DNI valido, por ejemplo 00000000T.");
        }

        if (!phone.matches("^\\+?[0-9]{9,20}$")) {
            throw new IllegalArgumentException("El telefono debe tener entre 9 y 20 numeros y puede empezar por +.");
        }

        userRepository.findByUsername(username)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> {
                    throw new IllegalStateException("Ya existe otro usuario con ese nombre de usuario.");
                });

        userRepository.findByEmail(email)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> {
                    throw new IllegalStateException("Ya existe otro usuario con ese email.");
                });

        userRepository.findByDni(dni)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> {
                    throw new IllegalStateException("Ya existe otro usuario con ese DNI.");
                });

        userRepository.findByPhone(phone)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> {
                    throw new IllegalStateException("Ya existe otro usuario con ese telefono.");
                });
    }

    private boolean sameUser(User left, User right) {
        if (right == null) {
            return false;
        }

        return left.getId() != null && left.getId().equals(right.getId());
    }

    private User requireAdmin(Authentication authentication) {
        String username = authentication == null ? "" : authentication.getName();
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Usuario no encontrado."));
        if (!"ADMIN".equals(normalizeRole(user.getRole()))) {
            throw new SecurityException("No tienes permisos para gestionar usuarios.");
        }

        return user;
    }

    private void validatePasswordChange(User user, String currentPassword, String newPassword, String confirmPassword) {
        if (!hasPasswordChange(currentPassword, newPassword, confirmPassword)) {
            return;
        }

        if (currentPassword == null || currentPassword.isBlank()) {
            throw new IllegalArgumentException("La contraseña actual es obligatoria para cambiar la contraseña.");
        }

        if (newPassword == null || newPassword.isBlank()) {
            throw new IllegalArgumentException("La nueva contraseña es obligatoria.");
        }

        if (newPassword.length() < 8) {
            throw new IllegalArgumentException("La nueva contraseña debe tener al menos 8 caracteres.");
        }

        if (!newPassword.equals(confirmPassword)) {
            throw new IllegalArgumentException("Las contraseñas no coinciden.");
        }

        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("La contraseña actual no es correcta.");
        }
    }

    private void validateCurrentPassword(User user, String currentPassword) {
        if (isBlank(currentPassword)) {
            throw new IllegalArgumentException("La contraseña del administrador es obligatoria.");
        }

        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("La contraseña del administrador no es correcta.");
        }
    }

    private boolean hasPasswordChange(String currentPassword, String newPassword, String confirmPassword) {
        return !isBlank(currentPassword) || !isBlank(newPassword) || !isBlank(confirmPassword);
    }

    private void validateNewPassword(String password, String confirmPassword) {
        if (isBlank(password)) {
            throw new IllegalArgumentException("La contraseña es obligatoria.");
        }

        if (password.length() < 8) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres.");
        }

        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Las contraseñas no coinciden.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String normalizeUsername(String value) {
        return value == null ? "" : value.trim();
    }

    private String normalizeEmail(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String normalizeDni(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String normalizePhone(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", "");
    }

    private String normalizeSpaces(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    private boolean isValidDni(String dni) {
        return dni != null && dni.matches("^\\d{8}[A-Z]$");
    }

    private void refreshAuthentication(Authentication authentication, User user) {
        if (authentication == null) {
            return;
        }

        var updatedAuthentication = new UsernamePasswordAuthenticationToken(
                user.getUsername(),
                authentication.getCredentials(),
                authentication.getAuthorities());
        updatedAuthentication.setDetails(authentication.getDetails());
        SecurityContextHolder.getContext().setAuthentication(updatedAuthentication);
    }

    private String messageOrDefault(Exception exception, String fallback) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
                ? fallback
                : exception.getMessage();
    }

    private record TopologyView(
            String id,
            String name,
            String description,
            Instant createdAt,
            Instant updatedAt,
            int nodes,
            int edges,
            String json) {
    }
}
