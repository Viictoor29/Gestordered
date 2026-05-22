package es.unex.cume.gestodered.controller;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.ui.Model;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import jakarta.servlet.http.HttpSession;

@Controller
public class HomeController {

    @Autowired
    private UserService userService;

    @GetMapping({"/", "/index"})
    public String index() {
        return "index";
    }

    @GetMapping("/login")
    public String loginPage() {
        return "index";
    }

    @PostMapping("/login")
    public String login(
            @RequestParam String username,
            @RequestParam String password,
            @RequestParam(required = false) String remember,
            HttpSession session,
            RedirectAttributes redirectAttributes) {
        
        // Validación básica
        if (username == null || username.isEmpty() || password == null || password.isEmpty()) {
            redirectAttributes.addAttribute("error", "Usuario y contraseña son requeridos");
            return "redirect:/";
        }
        
        // Buscar y autenticar usuario en la BD
        User user = userService.authenticate(username, password);
        
        if (user != null) {
            // Autenticación exitosa
            session.setAttribute("user", user);
            session.setAttribute("userId", user.getId());
            session.setAttribute("username", user.getUsername());
            
            return "redirect:/dashboard";
        } else {
            // Autenticación fallida
            redirectAttributes.addAttribute("error", "Usuario o contraseña incorrectos");
            return "redirect:/";
        }
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

    @GetMapping("/security-info")
    public String securityInfo(Model model) {
        model.addAttribute("title", "Información de Seguridad");
        return "security-info";
    }

    @GetMapping("/logout")
    public String logout(HttpSession session) {
        session.invalidate();
        return "redirect:/";
    }
}
