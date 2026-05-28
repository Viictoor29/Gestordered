package es.unex.cume.gestodered.config;

import jakarta.servlet.http.Cookie;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, UserDetailsService userDetailsService) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth

                // Rutas públicas
                .requestMatchers(
                    "/",
                    "/index",
                    "/index.html",
                    "/login",
                    "/register",
                    "/guest",
                    "/guest/role-requests",
                    "/guest/role-requests/status",
                    "/forgot-password",
                    "/error",
                    "/favicon.ico",
                    "/css/**",
                    "/js/**",
                    "/img/**",
                    "/images/**",
                    "/animation/**",
                    "/static/**"
                ).permitAll()

                // Todo lo demás requiere login
                .anyRequest().authenticated()
            )

            .formLogin(form -> form
                .loginPage("/")
                .loginProcessingUrl("/login")
                .usernameParameter("username")
                .passwordParameter("password")
                .successHandler((request, response, authentication) -> {
                    if (request.getParameter("remember") == null) {
                        Cookie rememberCookie = new Cookie("remember-me", "");
                        rememberCookie.setPath("/");
                        rememberCookie.setHttpOnly(true);
                        rememberCookie.setMaxAge(0);
                        response.addCookie(rememberCookie);
                    }

                    response.sendRedirect("/dashboard");
                })
                .failureHandler((request, response, exception) -> {
                    response.sendRedirect("/?error=true");
                })
                .permitAll()
            )

            .rememberMe(remember -> remember
                .rememberMeParameter("remember")
                .key("gestodered-remember-me")
                .tokenValiditySeconds(60 * 60 * 24 * 14)
                .userDetailsService(userDetailsService)
            )

            .logout(logout -> logout
                .logoutUrl("/logout")
                .logoutSuccessUrl("/")
                .invalidateHttpSession(true)
                .deleteCookies("JSESSIONID", "remember-me")
                .permitAll()
            )

            .httpBasic(httpBasic -> httpBasic.disable())
            .csrf(csrf -> csrf.disable());

        return http.build();
    }
}
