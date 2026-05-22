package es.unex.cume.gestodered.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.ui.Model;

@Controller
public class HomeController {

    @GetMapping({"/", "/index"})
    public String index() {
        return "index";
    }

    @GetMapping("/login")
    public String loginPage() {
        return "login";
    }

    @PostMapping("/login")
    public String login(
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam(required = false) String remember,
            Model model) {
        
        // TODO: Implementar lógica de autenticación
        // Por ahora, validación básica
        if (username == null || username.isEmpty() || password == null || password.isEmpty()) {
            return "redirect:/login?error=Usuario y contraseña son requeridos";
        }
        
        // TODO: Verificar credenciales contra la base de datos
        // TODO: Crear sesión de usuario
        
        // Redirección temporal al index (cambiar según tu lógica)
        return "redirect:/dashboard";
    }

    @GetMapping("/register")
    public String registerPage() {
        return "register";
    }

    @GetMapping("/guest")
    public String guestAccess() {
        return "guest-dashboard";
    }

    @GetMapping("/forgot-password")
    public String forgotPasswordPage() {
        return "forgot-password";
    }
}
