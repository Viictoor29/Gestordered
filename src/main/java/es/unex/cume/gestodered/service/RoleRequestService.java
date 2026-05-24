package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.RoleRequest;
import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.RoleRequestRepository;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.bson.types.ObjectId;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
public class RoleRequestService {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";

    private static final String DEFAULT_CURRENT_ROLE = "GUEST";
    private static final String DEFAULT_REQUESTED_ROLE = "OPERATOR";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", Pattern.CASE_INSENSITIVE);

    private final RoleRequestRepository roleRequestRepository;
    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder;

    public RoleRequestService(RoleRequestRepository roleRequestRepository, UserRepository userRepository, BCryptPasswordEncoder passwordEncoder) {
        this.roleRequestRepository = roleRequestRepository;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public RoleRequest createRequest(RoleRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("La solicitud no puede ser nula");
        }

        String email = normalizeLower(request.getEmail());
        String dni = normalizeUpper(request.getDni());

        if (isBlank(request.getFullName())) {
            throw new IllegalArgumentException("El nombre completo es obligatorio");
        }

        if (isBlank(request.getUsername())) {
            throw new IllegalArgumentException("El usuario es obligatorio");
        }

        if (isBlank(email)) {
            throw new IllegalArgumentException("El email es obligatorio");
        }

        if (!isValidEmail(email)) {
            throw new IllegalArgumentException("El email no tiene un formato valido");
        }

        if (isBlank(dni)) {
            throw new IllegalArgumentException("El DNI es obligatorio");
        }

        if (!isValidDniFormat(dni)) {
            throw new IllegalArgumentException("El DNI no tiene un formato valido");
        }

        if (isBlank(request.getPhone())) {
            throw new IllegalArgumentException("El telefono es obligatorio");
        }

        if (isBlank(request.getRequestedRole())) {
            throw new IllegalArgumentException("El tipo de cuenta es obligatorio");
        }

        if (hasPendingRequest(email, dni, request.getUsername())) {
            throw new IllegalStateException("Ya existe una solicitud pendiente para ese email, DNI o usuario");
        }

        request.setUsername(normalize(request.getUsername()));
        request.setFullName(normalize(request.getFullName()));
        request.setEmail(email);
        request.setDni(dni);
        request.setPhone(normalize(request.getPhone()));
        request.setCurrentRole(defaultIfBlank(normalizeRole(request.getCurrentRole()), DEFAULT_CURRENT_ROLE));
        request.setRequestedRole(defaultIfBlank(normalizeRole(request.getRequestedRole()), DEFAULT_REQUESTED_ROLE));
        request.setReason(defaultIfNull(normalize(request.getReason()), ""));
        request.setStatus(STATUS_PENDING);
        request.setReviewedBy(null);
        request.setCreatedAt(Instant.now());
        request.setReviewedAt(null);

        try {
            return roleRequestRepository.save(request);
        } catch (DuplicateKeyException exception) {
            throw new IllegalStateException("Ya existe una solicitud pendiente para ese email, DNI o usuario", exception);
        }
    }

    public RoleRequest createGuestRequest(RoleRequest request, String password, String confirmPassword) {
        if (request == null) {
            throw new IllegalArgumentException("La solicitud no puede ser nula");
        }

        if (isBlank(password)) {
            throw new IllegalArgumentException("La contraseña es obligatoria");
        }

        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Las contraseñas no coinciden");
        }

        request.setCurrentRole(DEFAULT_CURRENT_ROLE);
        request.setRequestedRole(DEFAULT_REQUESTED_ROLE);
        request.setPasswordHash(passwordEncoder.encode(password));
        validateGuestAccountDoesNotExist(request);

        return createRequest(request);
    }

    public RoleRequest createRequestForUser(User user, String requestedRole) {
        if (user == null) {
            throw new IllegalArgumentException("El usuario no puede ser nulo");
        }

        RoleRequest request = new RoleRequest();
        request.setUserId(toObjectId(user.getId()));
        request.setUsername(user.getUsername());
        request.setFullName(user.getFullName());
        request.setEmail(user.getEmail());
        request.setDni(user.getDni());
        request.setPhone(user.getPhone());
        request.setCurrentRole(user.getRole());
        request.setRequestedRole(requestedRole);

        return createRequest(request);
    }

    public List<RoleRequest> findAll() {
        return roleRequestRepository.findAll();
    }

    public Optional<RoleRequest> findById(String id) {
        return roleRequestRepository.findById(id);
    }

    public List<RoleRequest> findPending() {
        return roleRequestRepository.findByStatus(STATUS_PENDING);
    }

    public List<RoleRequest> findByEmail(String email) {
        return roleRequestRepository.findByEmail(normalizeLower(email));
    }

    public List<RoleRequest> findByDni(String dni) {
        return roleRequestRepository.findByDni(normalizeUpper(dni));
    }

    public List<RoleRequest> findByUsername(String username) {
        return roleRequestRepository.findByUsername(normalize(username));
    }

    public List<RoleRequest> findByUserId(String userId) {
        ObjectId objectId = toObjectId(userId);

        if (objectId == null) {
            return List.of();
        }

        return roleRequestRepository.findByUserId(objectId);
    }

    public Optional<RoleRequest> findGuestRequestByIdentifier(String identifier) {
        String cleanIdentifier = normalize(identifier);

        if (isBlank(cleanIdentifier)) {
            throw new IllegalArgumentException("Introduce un DNI, email o usuario");
        }

        String email = normalizeLower(cleanIdentifier);
        String dni = normalizeUpper(cleanIdentifier);

        if (isValidEmail(email)) {
            return roleRequestRepository.findFirstByCurrentRoleAndEmailOrderByCreatedAtDesc(DEFAULT_CURRENT_ROLE, email);
        }

        if (isValidDniFormat(dni)) {
            return roleRequestRepository.findFirstByCurrentRoleAndDniOrderByCreatedAtDesc(DEFAULT_CURRENT_ROLE, dni);
        }

        return roleRequestRepository.findFirstByCurrentRoleAndUsernameOrderByCreatedAtDesc(DEFAULT_CURRENT_ROLE, cleanIdentifier);
    }

    public boolean hasPendingRequest(String email, String dni) {
        return hasPendingRequest(email, dni, null);
    }

    public boolean hasPendingRequest(String email, String dni, String username) {
        String cleanEmail = normalizeLower(email);
        String cleanDni = normalizeUpper(dni);
        String cleanUsername = normalize(username);

        return (!isBlank(cleanEmail) && roleRequestRepository.findByEmailAndStatus(cleanEmail, STATUS_PENDING).isPresent())
                || (!isBlank(cleanDni) && roleRequestRepository.findByDniAndStatus(cleanDni, STATUS_PENDING).isPresent())
                || (!isBlank(cleanUsername) && roleRequestRepository.findByUsernameAndStatus(cleanUsername, STATUS_PENDING).isPresent());
    }

    public RoleRequest approveRequest(String requestId, String reviewerUserId) {
        RoleRequest request = reviewRequest(requestId, reviewerUserId, STATUS_APPROVED);

        if (request.getUserId() != null) {
            userRepository.findById(request.getUserId().toHexString()).ifPresent(user -> {
                user.setRole(request.getRequestedRole());
                user.setUpdatedAt(Instant.now());
                userRepository.save(user);
            });
        }

        return request;
    }

    public RoleRequest rejectRequest(String requestId, String reviewerUserId) {
        return reviewRequest(requestId, reviewerUserId, STATUS_REJECTED);
    }

    private RoleRequest reviewRequest(String requestId, String reviewerUserId, String status) {
        RoleRequest request = roleRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Solicitud no encontrada"));

        if (!STATUS_PENDING.equals(request.getStatus())) {
            throw new IllegalStateException("La solicitud ya fue revisada");
        }

        request.setStatus(status);
        request.setReviewedBy(toObjectId(reviewerUserId));
        request.setReviewedAt(Instant.now());

        return roleRequestRepository.save(request);
    }

    private void validateGuestAccountDoesNotExist(RoleRequest request) {
        String username = normalize(request.getUsername());
        String email = normalizeLower(request.getEmail());
        String dni = normalizeUpper(request.getDni());

        if (!isBlank(username) && userRepository.findByUsername(username).isPresent()) {
            throw new IllegalStateException("Ya existe una cuenta con ese usuario");
        }

        if (!isBlank(email) && userRepository.findByEmail(email).isPresent()) {
            throw new IllegalStateException("Ya existe una cuenta con ese email");
        }

        if (!isBlank(dni) && userRepository.findByDni(dni).isPresent()) {
            throw new IllegalStateException("Ya existe una cuenta con ese DNI");
        }
    }

    private ObjectId toObjectId(String value) {
        if (isBlank(value) || !ObjectId.isValid(value)) {
            return null;
        }

        return new ObjectId(value);
    }

    private String normalize(String value) {
        return value == null ? null : value.trim();
    }

    private String normalizeLower(String value) {
        String cleanValue = normalize(value);
        return cleanValue == null ? null : cleanValue.toLowerCase();
    }

    private String normalizeUpper(String value) {
        String cleanValue = normalize(value);
        return cleanValue == null ? null : cleanValue.toUpperCase();
    }

    private String normalizeRole(String role) {
        String cleanRole = normalizeUpper(role);
        return cleanRole == null ? null : cleanRole.replace("ROLE_", "");
    }

    private String defaultIfBlank(String value, String defaultValue) {
        return isBlank(value) ? defaultValue : value;
    }

    private String defaultIfNull(String value, String defaultValue) {
        return value == null ? defaultValue : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private boolean isValidEmail(String email) {
        return email != null && EMAIL_PATTERN.matcher(email).matches();
    }

    private boolean isValidDniFormat(String dni) {
        return dni != null && dni.matches("^\\d{8}[A-Z]$");
    }
}
