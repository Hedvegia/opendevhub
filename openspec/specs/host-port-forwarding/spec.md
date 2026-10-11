# host-port-forwarding Specification

## Purpose

How a project makes ports on the host reachable inside its containers: configuring host ports per project, serving them through the in-container relay, the limits on what opendevhub dials, status reporting, and what happens without the relay.

## Requirements

### Requirement: Host ports are configured per project

The system SHALL let each project list host ports (integers from 1 to 65535, at most 100), stored as `hostPorts` in the project's `config.json` entry. The list SHALL be empty by default, so no host port is reachable from a container unless the user adds it. Saving SHALL remove duplicates and sort the list. Saving an empty list SHALL remove the `hostPorts` key.

#### Scenario: New project

- **WHEN** a project is added
- **THEN** its host ports are empty and no environment of the project listens for host ports

#### Scenario: Port added in settings

- **WHEN** the user adds 9222 to a project's host ports
- **THEN** the project's `config.json` entry holds `"hostPorts": [9222]`

#### Scenario: Invalid port rejected

- **WHEN** a request saves host port 0 or 70000
- **THEN** the API rejects it with a validation error and the settings are unchanged

### Requirement: Host ports are reachable inside environments

For every running environment of a project, the system SHALL make each host port reachable inside the container at `127.0.0.1:<port>`, and at `[::1]:<port>` where the container has IPv6 loopback. The same port number SHALL be used inside the container as on the host. Each connection SHALL be piped to the same port on the host's loopback. The listener SHALL be served by the environment's relay, and opendevhub SHALL open the host side of each connection.

#### Scenario: CDP from inside the container

- **WHEN** a project has host port 9222, Chrome on the host listens on `127.0.0.1:9222`, and a process in a task container requests `http://localhost:9222/json/version`
- **THEN** it gets Chrome's answer, and a WebSocket to the returned `ws://localhost:9222/...` URL reaches the same browser

#### Scenario: Several environments

- **WHEN** a project's main environment and two task environments are running and the project has host port 9222
- **THEN** each of the three containers can connect to `localhost:9222`, and every connection reaches the host's port 9222

#### Scenario: Nothing listens on the host

- **WHEN** a container connects to a host port that nothing listens on on the host
- **THEN** the container's connection is closed, and the project log notes that the host port refused, at most once a minute per port

### Requirement: Only configured host loopback ports are dialed

The system SHALL only open host connections to `127.0.0.1` or `::1`, and only on ports in the project's current host ports. A connection the relay announces for any other port SHALL be refused without dialing. The system SHALL NOT bind any host socket for this feature.

#### Scenario: Relay announces an unconfigured port

- **WHEN** a relay announces a connection for port 22 while the project's host ports are `[9222]`
- **THEN** opendevhub does not connect to port 22 on the host and closes the announced connection

#### Scenario: Port removed while connected

- **WHEN** the user removes 9222 from the host ports
- **THEN** the containers stop listening on 9222, and later connection attempts to it inside the containers are refused

### Requirement: Settings changes apply to running environments

When a project's host ports change, the system SHALL start and stop listeners in the project's running environments to match, without restarting them. Environments that are starting SHALL read the current list when their ports are set up.

#### Scenario: Port added while running

- **WHEN** the user adds host port 9222 while a task environment is running
- **THEN** that container accepts connections on `localhost:9222` without being restarted

### Requirement: Host port status is visible

The system SHALL keep each environment's host port state in memory, never in the database. Each port SHALL be either `forwarded` or `unavailable` with a reason. The state SHALL appear on the environment's checkout page next to its forwarded ports, and every change SHALL be written to the project log.

#### Scenario: Port taken inside the container

- **WHEN** a process inside the container already listens on 9222 and 9222 is a host port
- **THEN** the port's state is `unavailable` with a reason saying the port is in use in the container, and the other host ports are unaffected

#### Scenario: State is not persisted

- **WHEN** a host port's state changes
- **THEN** the database is not written

### Requirement: Host ports need the relay

Host ports SHALL only be served through the environment's relay. When the relay can't run in an environment, every host port of that environment SHALL be `unavailable`, with a reason saying the relay is needed. There SHALL be no direct fallback.

#### Scenario: Relay unavailable

- **WHEN** neither opencode's Bun nor `node` can run the relay in a container and the project has host ports
- **THEN** each host port of that environment is `unavailable` with a reason naming the relay, and the project log says so

#### Scenario: Old relay replaced

- **WHEN** opendevhub reattaches to a container whose relay answers an older protocol version
- **THEN** it replaces the relay before it starts host port listeners

### Requirement: Host ports warn about what they expose

The project settings SHALL show host ports in their own section, separate from forwarded ports. The section SHALL say that every process in the project's containers gets full access to the service on that port. It SHALL recommend running Chrome with its own `--user-data-dir` for debugging ports, rather than the everyday profile.

#### Scenario: Settings shown

- **WHEN** the user opens a project's settings
- **THEN** a "Host ports" section lists the host ports with the access warning, next to the "Forwarded ports" section

### Requirement: Host and forwarded ports don't overlap

The system SHALL reject saving a host port that is also in the project's forwarded ports settings, and the reverse. When the devcontainer.json `forwardPorts` contains a host port, the host port SHALL win: that port SHALL not be forwarded, and the project log SHALL say why.

#### Scenario: Same port in both settings

- **WHEN** the user tries to add 9222 as a host port while 9222 is a forwarded port of the project
- **THEN** the save is rejected with a message naming the forwarded port

#### Scenario: devcontainer.json forwards a host port

- **WHEN** devcontainer.json forwards 9222 and 9222 is a host port of the project
- **THEN** 9222 is not forwarded to the host, the host port works, and the project log notes the skip
