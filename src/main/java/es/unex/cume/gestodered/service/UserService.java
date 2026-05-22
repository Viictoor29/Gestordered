package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private BCryptPasswordEncoder passwordEncoder;

    /**
     * Autentica un usuario buscándolo en la BD y validando la contraseña con BCrypt
     * @param username Usuario a buscar
     * @param password Contraseña en texto plano
     * @return Usuario si la autenticación es correcta, null en caso contrario
     */
    public User authenticate(String username, String password) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            // Validar contraseña usando BCrypt
            if (passwordEncoder.matches(password, user.getPasswordHash())) {
                return user;
            }
        }
        return null;
    }

    /**
     * Busca un usuario por nombre de usuario
     * @param username Usuario a buscar
     * @return Usuario si existe
     */
    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    /**
     * Codifica una contraseña usando BCrypt
     * @param plainPassword Contraseña en texto plano
     * @return Contraseña codificada con BCrypt
     */
    public String encodePassword(String plainPassword) {
        return passwordEncoder.encode(plainPassword);
    }

    /**
     * Crea un nuevo usuario con contraseña cifrada
     * @param user Usuario a crear
     * @return Usuario creado
     */
    public User createUser(User user) {
        // Codificar la contraseña antes de guardar
        user.setPasswordHash(encodePassword(user.getPasswordHash()));
        user.setEnabled(true);
        return userRepository.save(user);
    }
}
