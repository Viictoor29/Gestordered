package es.unex.cume.gestodered.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class HomeController {

    @GetMapping({"/", "/index", "/login"})
    public String index() {
        return "index";
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