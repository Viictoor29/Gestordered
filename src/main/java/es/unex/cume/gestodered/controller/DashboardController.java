package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class DashboardController {

    private final UserRepository userRepository;

    public DashboardController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/dashboard")
    public String dashboard(Authentication authentication, Model model) {
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

        model.addAttribute("user", user);
        model.addAttribute("role", role);
        model.addAttribute("roleLabel", roleLabel(role));
        model.addAttribute("isAdmin", "ADMIN".equals(role));
        model.addAttribute("displayName", displayName);
        model.addAttribute("avatarInitial", displayName.substring(0, 1).toUpperCase());

        return "dashboard";
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

    private String displayName(User user) {
        if (user.getFullName() != null && !user.getFullName().isBlank()) {
            return user.getFullName();
        }

        if (user.getUsername() != null && !user.getUsername().isBlank()) {
            return user.getUsername();
        }

        return "Usuario";
    }
}
