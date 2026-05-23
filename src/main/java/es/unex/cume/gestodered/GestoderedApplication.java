package es.unex.cume.gestodered;

import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.UserRepository;
import org.bson.Document;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.data.mongodb.MongoDatabaseFactory;
import org.springframework.data.mongodb.core.MongoTemplate;

@SpringBootApplication
public class GestoderedApplication {

    public static void main(String[] args) {
        SpringApplication.run(GestoderedApplication.class, args);
    }

    @Bean
    CommandLineRunner debugMongo(
            MongoDatabaseFactory mongoDatabaseFactory,
            MongoTemplate mongoTemplate,
            UserRepository userRepository
    ) {
        return args -> {
            System.out.println("========== DEBUG MONGO ==========");

            System.out.println("DB REAL DE SPRING: " + mongoDatabaseFactory.getMongoDatabase().getName());

            System.out.println("COLECCIONES:");
            mongoTemplate.getCollectionNames().forEach(c -> System.out.println(" - " + c));

            System.out.println("COUNT RAW users: " + mongoTemplate.getCollection("users").countDocuments());

            System.out.println("RAW find username admin:");
            Document rawAdmin = mongoTemplate
                    .getCollection("users")
                    .find(new Document("username", "admin"))
                    .first();

            System.out.println(rawAdmin);

            System.out.println("COUNT REPOSITORY users: " + userRepository.count());

            System.out.println("REPOSITORY findByUsername admin:");
            System.out.println(userRepository.findByUsername("admin").isPresent());

            System.out.println("REPOSITORY findAll:");
            for (User u : userRepository.findAll()) {
                System.out.println("USER: [" + u.getUsername() + "] EMAIL: [" + u.getEmail() + "]");
            }

            System.out.println("========== FIN DEBUG MONGO ==========");
        };
    }
}
