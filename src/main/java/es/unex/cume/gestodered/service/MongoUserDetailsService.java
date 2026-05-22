package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class MongoUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public MongoUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserDetails loadUserByUsername(String login) throws UsernameNotFoundException {
        String cleanLogin = login == null ? "" : login.trim();

        User user = userRepository.findByUsernameOrEmail(cleanLogin, cleanLogin)
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado"));

        String role = user.getRole();

        if (role == null || role.isBlank()) {
            role = "OPERATOR";
        }

        role = role.replace("ROLE_", "");

        return org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getPasswordHash())
                .roles(role)
                .disabled(!user.isEnabled())
                .build();
    }
}
