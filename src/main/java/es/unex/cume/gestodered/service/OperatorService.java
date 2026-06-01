package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

@Service
public class OperatorService {

    private final UserRepository userRepository;
    private final UserProfileService userProfileService;
    private final RoleRequestService roleRequestService;

    public OperatorService(
            UserRepository userRepository,
            UserProfileService userProfileService,
            RoleRequestService roleRequestService) {
        this.userRepository = userRepository;
        this.userProfileService = userProfileService;
        this.roleRequestService = roleRequestService;
    }

    public List<User> findOperators() {
        return userRepository.findAll().stream()
                .filter(user -> "OPERATOR".equals(userProfileService.normalizeRole(user.getRole())))
                .sorted(Comparator.comparing(userProfileService::displayName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public User createOperator(Authentication authentication, OperatorCreateRequest request) {
        requireRole(authentication, "ADMIN");
        User operator = userProfileService.buildValidatedUser(
                request.fullName(),
                request.username(),
                request.email(),
                request.dni(),
                request.phone(),
                request.password(),
                request.confirmPassword());
        operator.setRole("OPERATOR");
        operator.setEnabled(true);
        operator.setCreatedAt(Instant.now());
        operator.setUpdatedAt(Instant.now());
        return userRepository.save(operator);
    }

    public long deleteOperator(Authentication authentication, String id, String adminPassword) {
        User admin = requireRole(authentication, "ADMIN");
        User operator = userRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado el operador."));
        userProfileService.validateCurrentPassword(admin, adminPassword);

        if (admin.getId() != null && admin.getId().equals(id)) {
            throw new IllegalStateException("No puedes borrar tu propio usuario.");
        }
        if (!"OPERATOR".equals(userProfileService.normalizeRole(operator.getRole()))) {
            throw new IllegalStateException("Solo puedes borrar operadores desde este apartado.");
        }

        long deletedRequests = roleRequestService.deleteRequestsForUser(operator);
        userRepository.delete(operator);
        return deletedRequests;
    }

    public Optional<String> findDisplayName(String id) {
        return userRepository.findById(id).map(userProfileService::displayName);
    }

    public User requireRole(Authentication authentication, String requiredRole) {
        User user = userProfileService.requireAuthenticatedUser(authentication);
        if (!requiredRole.equals(userProfileService.normalizeRole(user.getRole()))) {
            throw new SecurityException("No tienes permisos para gestionar usuarios.");
        }
        return user;
    }

    public User requireExplicitRole(Authentication authentication, String requiredRole) {
        User user = userProfileService.requireAuthenticatedUser(authentication);
        String role = user.getRole() == null ? "" : user.getRole().replace("ROLE_", "").toUpperCase();
        if (!requiredRole.equals(role)) {
            throw new SecurityException("No tienes permisos para gestionar usuarios.");
        }
        return user;
    }

    public record OperatorCreateRequest(
            String fullName,
            String username,
            String email,
            String dni,
            String phone,
            String password,
            String confirmPassword) {
    }
}
