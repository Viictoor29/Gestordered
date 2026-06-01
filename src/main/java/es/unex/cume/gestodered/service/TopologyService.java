package es.unex.cume.gestodered.service;

import es.unex.cume.gestodered.data.model.Topology;
import es.unex.cume.gestodered.data.model.User;
import es.unex.cume.gestodered.data.repository.TopologyRepository;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class TopologyService {

    private final TopologyRepository topologyRepository;
    private final OperatorService operatorService;
    private final UserProfileService userProfileService;

    public TopologyService(
            TopologyRepository topologyRepository,
            OperatorService operatorService,
            UserProfileService userProfileService) {
        this.topologyRepository = topologyRepository;
        this.operatorService = operatorService;
        this.userProfileService = userProfileService;
    }

    public List<TopologyView> findTopologyViews() {
        return topologyRepository.findAll().stream()
                .sorted(Comparator.comparing(
                        topology -> topology.getUpdatedAt() == null ? Instant.EPOCH : topology.getUpdatedAt(),
                        Comparator.reverseOrder()))
                .map(this::toTopologyView)
                .toList();
    }

    public void uploadTopology(Authentication authentication, String name, String description, MultipartFile file) throws Exception {
        User admin = operatorService.requireRole(authentication, "ADMIN");
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Selecciona un archivo JSON.");
        }

        Document payloadDocument = Document.parse(new String(file.getBytes(), StandardCharsets.UTF_8));
        Map<String, Object> payload = new LinkedHashMap<>(payloadDocument);
        saveTopology(
                admin,
                normalizeTopologyName(name, payload, file.getOriginalFilename()),
                normalizeTopologyDescription(description, payload),
                extractTopologyData(payload));
    }

    public void saveTopology(Authentication authentication, Map<String, Object> body) {
        User admin = operatorService.requireRole(authentication, "ADMIN");
        if (body == null) {
            throw new IllegalArgumentException("No se ha recibido la topologia.");
        }

        Object rawPayload = body.get("payload");
        if (!(rawPayload instanceof Map<?, ?> rawMap)) {
            throw new IllegalArgumentException("No se ha recibido la topologia.");
        }

        Map<String, Object> payload = toStringObjectMap(rawMap);
        saveTopology(
                admin,
                normalizeTopologyName(stringValue(body.get("name")), payload, null),
                normalizeTopologyDescription(stringValue(body.get("description")), payload),
                extractTopologyData(payload));
    }

    public TopologyDownload downloadTopology(Authentication authentication, String id) {
        operatorService.requireRole(authentication, "ADMIN");
        Topology topology = topologyRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado la topologia."));
        return new TopologyDownload(sanitizeFilename(topology.getName()) + ".json", toJsonBytes(topology.getData()));
    }

    public void deleteTopology(Authentication authentication, String id, String adminPassword) {
        User admin = operatorService.requireRole(authentication, "ADMIN");
        Topology topology = topologyRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("No se ha encontrado la topologia."));
        userProfileService.validateCurrentPassword(admin, adminPassword);
        topologyRepository.delete(topology);
    }

    public Optional<String> findName(String id) {
        return topologyRepository.findById(id).map(Topology::getName);
    }

    private TopologyView toTopologyView(Topology topology) {
        Map<String, Object> data = topology.getData() == null ? Map.of() : topology.getData();
        return new TopologyView(
                topology.getId(),
                topology.getName(),
                topology.getDescription(),
                topology.getCreatedAt(),
                topology.getUpdatedAt(),
                countTopologyNodes(data),
                countTopologyEdges(data),
                buildTopologyExport(topology).toJson());
    }

    private int countTopologyNodes(Map<String, Object> data) {
        Object topologyNodes = getNestedValue(data, "topology", "nodes");
        if (topologyNodes instanceof List<?> nodes) {
            return nodes.size();
        }
        Object switches = getNestedValue(data, "mininet", "switches");
        Object hosts = getNestedValue(data, "mininet", "hosts");
        int count = (switches instanceof List<?> list ? list.size() : 0) + (hosts instanceof List<?> list ? list.size() : 0);
        return count > 0 ? count : countNamedCollection(data, Set.of("nodes"));
    }

    private int countTopologyEdges(Map<String, Object> data) {
        Object topologyEdges = getNestedValue(data, "topology", "edges");
        if (topologyEdges instanceof List<?> edges) {
            return edges.size();
        }
        Object links = getNestedValue(data, "mininet", "links");
        int count = (links instanceof List<?> list ? list.size() : 0) + countMininetHostLinks(getNestedValue(data, "mininet", "hosts"));
        return count > 0 ? count : countNamedCollection(data, Set.of("edges", "links"));
    }

    private int countMininetHostLinks(Object hostsValue) {
        if (!(hostsValue instanceof List<?> hosts)) {
            return 0;
        }
        return (int) hosts.stream()
                .filter(Map.class::isInstance)
                .map(Map.class::cast)
                .filter(host -> hasValue(host.get("switch")) || hasValue(host.get("switch_dpid")) || hasValue(host.get("switch_port")))
                .count();
    }

    private boolean hasValue(Object value) {
        return value != null && !String.valueOf(value).isBlank();
    }

    private Object getNestedValue(Map<String, Object> data, String parentKey, String childKey) {
        Object parent = data.get(parentKey);
        return parent instanceof Map<?, ?> map ? map.get(childKey) : null;
    }

    private int countNamedCollection(Object value, Set<String> keys) {
        if (value instanceof Map<?, ?> map) {
            for (String key : keys) {
                if (map.get(key) instanceof List<?> list) {
                    return list.size();
                }
            }
            return map.values().stream().mapToInt(child -> countNamedCollection(child, keys)).filter(count -> count > 0).findFirst().orElse(0);
        }
        if (value instanceof List<?> list) {
            return list.stream().mapToInt(child -> countNamedCollection(child, keys)).filter(count -> count > 0).findFirst().orElse(0);
        }
        return 0;
    }

    private Document buildTopologyExport(Topology topology) {
        Document exportPayload = new Document();
        exportPayload.put("name", topology.getName());
        exportPayload.put("description", topology.getDescription());
        exportPayload.put("data", toBsonValue(topology.getData()));
        exportPayload.put("createdAt", topology.getCreatedAt() == null ? null : topology.getCreatedAt().toString());
        exportPayload.put("updatedAt", topology.getUpdatedAt() == null ? null : topology.getUpdatedAt().toString());
        return exportPayload;
    }

    private void saveTopology(User admin, String name, String description, Map<String, Object> topologyData) {
        topologyRepository.findByName(name).ifPresent(existing -> {
            throw new IllegalStateException("Ya existe una topologia con ese nombre.");
        });
        Topology topology = new Topology();
        topology.setName(name);
        topology.setDescription(description);
        topology.setData(topologyData);
        topology.setCreatedBy(admin.getId() != null && ObjectId.isValid(admin.getId()) ? new ObjectId(admin.getId()) : null);
        topology.setCreatedAt(Instant.now());
        topology.setUpdatedAt(Instant.now());
        topologyRepository.save(topology);
    }

    private Object toBsonValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Document document = new Document();
            map.forEach((key, childValue) -> document.put(String.valueOf(key), toBsonValue(childValue)));
            return document;
        }
        return value instanceof List<?> list ? list.stream().map(this::toBsonValue).toList() : value;
    }

    private byte[] toJsonBytes(Map<String, Object> data) {
        Object value = toBsonValue(data == null ? Map.of() : data);
        String json = value instanceof Document document ? document.toJson() : new Document("data", value).toJson();
        return json.getBytes(StandardCharsets.UTF_8);
    }

    private Map<String, Object> toStringObjectMap(Map<?, ?> rawMap) {
        Map<String, Object> converted = new LinkedHashMap<>();
        rawMap.forEach((key, value) -> converted.put(String.valueOf(key), value));
        return converted;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractTopologyData(Map<String, Object> payload) {
        return payload.get("data") instanceof Map<?, ?> data ? (Map<String, Object>) data : payload;
    }

    private String normalizeTopologyName(String name, Map<String, Object> payload, String originalFilename) {
        String value = normalizeSpaces(name);
        if (value.isBlank() && payload.get("name") instanceof String payloadName) {
            value = normalizeSpaces(payloadName);
        }
        if (value.isBlank()) {
            value = filenameWithoutExtension(originalFilename);
        }
        if (value.length() < 3 || value.length() > 80) {
            throw new IllegalArgumentException("El nombre de la topologia debe tener entre 3 y 80 caracteres.");
        }
        return value;
    }

    private String normalizeTopologyDescription(String description, Map<String, Object> payload) {
        String value = normalizeSpaces(description);
        if (value.isBlank() && payload.get("description") instanceof String payloadDescription) {
            value = normalizeSpaces(payloadDescription);
        }
        return value.length() > 240 ? value.substring(0, 240) : value;
    }

    private String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String filenameWithoutExtension(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "topologia-importada";
        }
        String filename = originalFilename.replace("\\", "/");
        filename = filename.substring(filename.lastIndexOf('/') + 1);
        int dotIndex = filename.lastIndexOf('.');
        return normalizeSpaces(dotIndex > 0 ? filename.substring(0, dotIndex) : filename);
    }

    private String sanitizeFilename(String value) {
        String filename = value == null ? "topologia" : value.trim().toLowerCase(Locale.ROOT);
        filename = filename.replaceAll("[^a-z0-9._-]+", "-").replaceAll("^-+|-+$", "");
        return filename.isBlank() ? "topologia" : filename;
    }

    private String normalizeSpaces(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    public record TopologyDownload(String filename, byte[] body) {
    }

    public record TopologyView(
            String id,
            String name,
            String description,
            Instant createdAt,
            Instant updatedAt,
            int nodes,
            int edges,
            String json) {
    }
}
