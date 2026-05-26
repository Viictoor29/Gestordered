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
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Stream;

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
        request.setRejectionReason(null);
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

        if (password.length() < 8) {
            throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres");
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
        return createRequestForUser(user, requestedRole, "");
    }

    public RoleRequest createRequestForUser(User user, String requestedRole, String reason) {
        if (user == null) {
            throw new IllegalArgumentException("El usuario no puede ser nulo");
        }

        ObjectId userId = toObjectId(user.getId());
        if (userId != null && roleRequestRepository.findByUserIdAndStatus(userId, STATUS_PENDING).isPresent()) {
            throw new IllegalStateException("Ya tienes una solicitud pendiente. Espera a que un administrador la revise.");
        }

        RoleRequest request = new RoleRequest();
        request.setUserId(userId);
        request.setUsername(user.getUsername());
        request.setFullName(user.getFullName());
        request.setEmail(user.getEmail());
        request.setDni(user.getDni());
        request.setPhone(user.getPhone());
        request.setCurrentRole(user.getRole());
        request.setRequestedRole(requestedRole);
        request.setReason(reason);

        return createRequest(request);
    }

    public List<RoleRequest> findAll() {
        return roleRequestRepository.findAll();
    }

    public List<RoleRequest> findFiltered(String status, String requestedRole, String currentRole, String search) {
        String cleanStatus = normalizeUpper(status);
        String cleanRequestedRole = normalizeRole(requestedRole);
        String cleanCurrentRole = normalizeRole(currentRole);
        String cleanSearch = normalizeLower(search);

        Stream<RoleRequest> requests = roleRequestRepository.findAll().stream();

        if (!isBlank(cleanStatus)) {
            requests = requests.filter(request -> cleanStatus.equals(normalizeUpper(request.getStatus())));
        }

        if (!isBlank(cleanRequestedRole)) {
            requests = requests.filter(request -> cleanRequestedRole.equals(normalizeRole(request.getRequestedRole())));
        }

        if (!isBlank(cleanCurrentRole)) {
            requests = requests.filter(request -> cleanCurrentRole.equals(normalizeRole(request.getCurrentRole())));
        }

        if (!isBlank(cleanSearch)) {
            requests = requests.filter(request -> containsIgnoreCase(request.getUsername(), cleanSearch)
                    || containsIgnoreCase(request.getFullName(), cleanSearch)
                    || containsIgnoreCase(request.getEmail(), cleanSearch)
                    || containsIgnoreCase(request.getDni(), cleanSearch)
                    || containsIgnoreCase(request.getPhone(), cleanSearch));
        }

        return requests
                .sorted(Comparator.comparing(RoleRequest::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
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

    public List<RoleRequest> findRequestsForUser(User user) {
        if (user == null) {
            return List.of();
        }

        return findRequestsMatchingUser(user);
    }

    public long deleteRequestsForUser(User user) {
        if (user == null) {
            return 0;
        }

        List<RoleRequest> requests = findRequestsMatchingUser(user);
        roleRequestRepository.deleteAll(requests);
        return requests.size();
    }

    private List<RoleRequest> findRequestsMatchingUser(User user) {
        ObjectId userId = toObjectId(user.getId());
        String username = normalize(user.getUsername());
        String email = normalizeLower(user.getEmail());
        String dni = normalizeUpper(user.getDni());

        return roleRequestRepository.findAll().stream()
                .filter(request -> (userId != null && userId.equals(request.getUserId()))
                        || (!isBlank(username) && username.equals(normalize(request.getUsername())))
                        || (!isBlank(email) && email.equals(normalizeLower(request.getEmail())))
                        || (!isBlank(dni) && dni.equals(normalizeUpper(request.getDni()))))
                .toList();
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
        RoleRequest request = roleRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Solicitud no encontrada"));

        if (!STATUS_PENDING.equals(request.getStatus())) {
            throw new IllegalStateException("La solicitud ya fue revisada");
        }

        if (request.getUserId() != null) {
            User user = userRepository.findById(request.getUserId().toHexString())
                    .orElseThrow(() -> new IllegalStateException("No se encontro el usuario asociado a la solicitud"));
            updateUserFromApprovedRequest(user, request);
            user.setUpdatedAt(Instant.now());
            userRepository.save(user);
        } else {
            User createdUser = createUserFromGuestRequest(request);
            request.setUserId(toObjectId(createdUser.getId()));
        }

        request.setStatus(STATUS_APPROVED);
        request.setReviewedBy(toObjectId(reviewerUserId));
        request.setReviewedAt(Instant.now());

        return roleRequestRepository.save(request);
    }

    public RoleRequest rejectRequest(String requestId, String reviewerUserId, String rejectionReason) {
        String cleanRejectionReason = normalize(rejectionReason);

        if (isBlank(cleanRejectionReason)) {
            throw new IllegalArgumentException("La justificacion del rechazo es obligatoria");
        }

        RoleRequest request = roleRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Solicitud no encontrada"));

        if (!STATUS_PENDING.equals(request.getStatus())) {
            throw new IllegalStateException("La solicitud ya fue revisada");
        }

        request.setStatus(STATUS_REJECTED);
        request.setRejectionReason(cleanRejectionReason);
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

        String phone = normalizePhone(request.getPhone());
        if (!isBlank(phone) && userRepository.findByPhone(phone).isPresent()) {
            throw new IllegalStateException("Ya existe una cuenta con ese telefono");
        }
    }

    private User createUserFromGuestRequest(RoleRequest request) {
        if (isBlank(request.getPasswordHash())) {
            throw new IllegalStateException("La solicitud aprobada no tiene credenciales para crear la cuenta");
        }

        validateGuestAccountDoesNotExist(request);

        User user = new User();
        user.setUsername(request.getUsername());
        user.setFullName(request.getFullName());
        user.setEmail(request.getEmail());
        user.setDni(request.getDni());
        user.setPhone(normalizePhone(request.getPhone()));
        user.setPasswordHash(request.getPasswordHash());
        user.setRole(defaultIfBlank(normalizeRole(request.getRequestedRole()), DEFAULT_REQUESTED_ROLE));
        user.setEnabled(true);
        user.setCreatedAt(Instant.now());
        user.setUpdatedAt(Instant.now());

        return userRepository.save(user);
    }

    private void updateUserFromApprovedRequest(User user, RoleRequest request) {
        user.setFullName(defaultIfBlank(normalize(request.getFullName()), user.getFullName()));
        user.setUsername(defaultIfBlank(normalize(request.getUsername()), user.getUsername()));
        user.setEmail(defaultIfBlank(normalizeLower(request.getEmail()), user.getEmail()));
        user.setDni(defaultIfBlank(normalizeUpper(request.getDni()), user.getDni()));
        user.setPhone(defaultIfBlank(normalizePhone(request.getPhone()), user.getPhone()));
        user.setRole(defaultIfBlank(normalizeRole(request.getRequestedRole()), user.getRole()));
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

    private String normalizePhone(String value) {
        String cleanValue = normalize(value);
        return cleanValue == null ? null : cleanValue.replace(" ", "");
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

    private boolean containsIgnoreCase(String value, String search) {
        return value != null && value.toLowerCase().contains(search);
    }
}
