package es.unex.cume.gestodered.config;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
public class StartupUserInitializer implements CommandLineRunner {

    private final UserRepository userRepository;

    public StartupUserInitializer(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public void run(String... args) {
        List<User> users = List.of(
                user(
                        "6a0e40b95b37cc24da9df8a3",
                        "admin",
                        "Administrador de prueba",
                        "admin@local.com",
                        "00000000A",
                        "600000000",
                        "$2a$10$/miVtAi89hmmHhwYt5nw9.qZpfTdXhxVnPZr4Omr6jipqcBYUnwZu",
                        "ADMIN"),
                user(
                        "6a0e40b95b37cc24da9df8a4",
                        "operador",
                        "Operador de pruebas",
                        "operador@local.com",
                        "11111111B",
                        "611111111",
                        "$2a$10$ZqvWowiqwYCBP5Zj1xEgK.8XkKhNx8Xa5.CmRrZuOMCWQG7U0auMi",
                        "OPERATOR")
        );

        users.stream()
                .filter(this::doesNotExist)
                .forEach(userRepository::save);
    }

    private boolean doesNotExist(User user) {
        return userRepository.findById(user.getId()).isEmpty()
                && userRepository.findByUsername(user.getUsername()).isEmpty()
                && userRepository.findByEmail(user.getEmail()).isEmpty()
                && userRepository.findByDni(user.getDni()).isEmpty()
                && userRepository.findByPhone(user.getPhone()).isEmpty();
    }

    private User user(
            String id,
            String username,
            String fullName,
            String email,
            String dni,
            String phone,
            String passwordHash,
            String role) {
        Instant now = Instant.now();
        User user = new User();
        user.setId(id);
        user.setUsername(username);
        user.setFullName(fullName);
        user.setEmail(email);
        user.setDni(dni);
        user.setPhone(phone);
        user.setPasswordHash(passwordHash);
        user.setRole(role);
        user.setEnabled(true);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        return user;
    }
}
