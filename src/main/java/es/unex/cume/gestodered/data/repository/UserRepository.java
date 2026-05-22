package es.unex.cume.gestodered.data.repository;

import es.unex.cume.gestodered.data.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByUsername(String username);

    Optional<User> findByEmail(String email);

    Optional<User> findByDni(String dni);

    Optional<User> findByUsernameOrEmail(String username, String email);
}