package es.unex.cume.gestodered.data.repository;

import es.unex.cume.gestodered.data.model.Topology;
import org.bson.types.ObjectId;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface TopologyRepository extends MongoRepository<Topology, String> {

    Optional<Topology> findByName(String name);

    List<Topology> findByCreatedBy(ObjectId createdBy);
}