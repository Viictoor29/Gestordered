package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import java.time.Instant;
import java.util.Locale;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserProfileService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public UserProfileService(UserRepository userRepository, BCryptPasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User findDashboardUser(Authentication authentication) {
        String username = authentication == null ? "" : authentication.getName();
        return userRepository.findByUsername(username).orElseGet(() -> {
            User user = new User();
            user.setUsername(username);
            user.setRole("OPERATOR");
            user.setEnabled(true);
            return user;
        });
    }

    public User requireAuthenticatedUser(Authentication authentication) {
        String username = authentication == null ? "" : authentication.getName();
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new SecurityException("Usuario no encontrado."));
    }

    public void updateProfile(Authentication authentication, ProfileUpdateRequest request) {
        String currentUsername = authentication == null ? "" : authentication.getName();
        User user = userRepository.findByUsername(currentUsername)
                .orElseThrow(() -> new IllegalStateException("No se ha encontrado el usuario actual."));

        String fullName = normalizeSpaces(request.fullName());
        String username = normalizeUsername(request.username());
        String email = normalizeEmail(request.email());
        String dni = normalizeDni(request.dni());
        String phone = normalizePhone(request.phone());

        validateProfile(user, fullName, username, email, dni, phone);
        validatePasswordChange(user, request.currentPassword(), request.newPassword(), request.confirmPassword());

        user.setFullName(fullName);
        user.setUsername(username);
        user.setEmail(email);
        user.setDni(dni);
        user.setPhone(phone);
        if (hasPasswordChange(request.currentPassword(), request.newPassword(), request.confirmPassword())) {
            user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        }
        user.setUpdatedAt(Instant.now());

        userRepository.save(user);
        refreshAuthentication(authentication, user);
    }

    public User buildValidatedUser(
            String fullName,
            String username,
            String email,
            String dni,
            String phone,
            String password,
            String confirmPassword) {
        String cleanFullName = normalizeSpaces(fullName);
        String cleanUsername = normalizeUsername(username);
        String cleanEmail = normalizeEmail(email);
        String cleanDni = normalizeDni(dni);
        String cleanPhone = normalizePhone(phone);

        validateProfile(null, cleanFullName, cleanUsername, cleanEmail, cleanDni, cleanPhone);
        validateNewPassword(password, confirmPassword);

        User user = new User();
        user.setFullName(cleanFullName);
        user.setUsername(cleanUsername);
        user.setEmail(cleanEmail);
        user.setDni(cleanDni);
        user.setPhone(cleanPhone);
        user.setPasswordHash(passwordEncoder.encode(password));
        return user;
    }

    public void validateCurrentPassword(User user, String currentPassword) {
        if (isBlank(currentPassword)) {
            throw new IllegalArgumentException("La contrase\u00f1a del administrador es obligatoria.");
        }

        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("La contrase\u00f1a del administrador no es correcta.");
        }
    }

    public String normalizeRole(String role) {
        if (role == null || role.isBlank()) {
            return "OPERATOR";
        }
        return role.replace("ROLE_", "").toUpperCase();
    }

    public String displayName(User user) {
        if (user.getFullName() != null && !user.getFullName().isBlank()) {
            return user.getFullName();
        }
        if (user.getUsername() != null && !user.getUsername().isBlank()) {
            return user.getUsername();
        }
        return "Usuario";
    }

    private void validateProfile(User currentUser, String fullName, String username, String email, String dni, String phone) {
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
                .ifPresent(existing -> failDuplicate("Ya existe otro usuario con ese nombre de usuario."));
        userRepository.findByEmail(email)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> failDuplicate("Ya existe otro usuario con ese email."));
        userRepository.findByDni(dni)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> failDuplicate("Ya existe otro usuario con ese DNI."));
        userRepository.findByPhone(phone)
                .filter(existing -> !sameUser(existing, currentUser))
                .ifPresent(existing -> failDuplicate("Ya existe otro usuario con ese telefono."));
    }

    private void failDuplicate(String message) {
        throw new IllegalStateException(message);
    }

    private boolean sameUser(User left, User right) {
        return right != null && left.getId() != null && left.getId().equals(right.getId());
    }

    private void validatePasswordChange(User user, String currentPassword, String newPassword, String confirmPassword) {
        if (!hasPasswordChange(currentPassword, newPassword, confirmPassword)) {
            return;
        }
        if (isBlank(currentPassword)) {
            throw new IllegalArgumentException("La contrase\u00f1a actual es obligatoria para cambiar la contrase\u00f1a.");
        }
        if (isBlank(newPassword)) {
            throw new IllegalArgumentException("La nueva contrase\u00f1a es obligatoria.");
        }
        if (newPassword.length() < 8) {
            throw new IllegalArgumentException("La nueva contrase\u00f1a debe tener al menos 8 caracteres.");
        }
        if (!newPassword.equals(confirmPassword)) {
            throw new IllegalArgumentException("Las contrase\u00f1as no coinciden.");
        }
        if (user.getPasswordHash() == null || !passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("La contrase\u00f1a actual no es correcta.");
        }
    }

    private void validateNewPassword(String password, String confirmPassword) {
        if (isBlank(password)) {
            throw new IllegalArgumentException("La contrase\u00f1a es obligatoria.");
        }
        if (password.length() < 8) {
            throw new IllegalArgumentException("La contrase\u00f1a debe tener al menos 8 caracteres.");
        }
        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Las contrase\u00f1as no coinciden.");
        }
    }

    private boolean hasPasswordChange(String currentPassword, String newPassword, String confirmPassword) {
        return !isBlank(currentPassword) || !isBlank(newPassword) || !isBlank(confirmPassword);
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

    public record ProfileUpdateRequest(
            String fullName,
            String username,
            String email,
            String dni,
            String phone,
            String currentPassword,
            String newPassword,
            String confirmPassword) {
    }
}
