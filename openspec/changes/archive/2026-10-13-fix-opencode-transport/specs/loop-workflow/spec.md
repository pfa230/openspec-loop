# Spec Delta

## ADDED Requirements

### Requirement: OpenCode transport lifetime

The OpenCode adapter SHALL explicitly disable client response-header and response-body inactivity timeouts for its local HTTP requests and event subscription. Waiting for a prompt SHALL have no adapter-imposed elapsed-time limit. Worker interruption, transport or session failure and unexpected server exit SHALL still end the worker through the existing owned-server lifecycle.

#### Scenario: Prompt delays response headers
- **WHEN** an OpenCode prompt completes successfully after a delay longer than the HTTP client's default header timeout
- **THEN** the adapter waits for completion and writes the successful native structured reply instead of failing on that default timeout

#### Scenario: Prompt pauses response-body delivery
- **WHEN** the prompt response starts and then pauses longer than the HTTP client's default body inactivity timeout before delivering the remaining valid response
- **THEN** the adapter waits for the remaining response and writes the successful native structured reply

#### Scenario: Event subscription is temporarily quiet
- **WHEN** the event subscription emits no data for longer than the HTTP client's default body inactivity timeout while the prompt is still pending, then resumes and reports completion
- **THEN** the adapter keeps the subscription open and completes with the native reply and the reported usage

#### Scenario: Worker interrupted during an unbounded wait
- **WHEN** the worker is interrupted while waiting for prompt headers, response-body data or event-stream data
- **THEN** those waits are cancelled and the owned server is stopped without waiting for a response or an inactivity timeout

### Requirement: OpenCode failure diagnostics

Before cleanup, the OpenCode adapter SHALL retain the originating failure's name, message, code, complete cause chain and available stacks in the existing worker transcript. HTTP failures SHALL identify the method, API path and whether the failure occurred requesting or reading the response. Diagnostics SHALL NOT dump authentication headers or request bodies. Cleanup errors SHALL NOT erase the originating diagnostic.

#### Scenario: Transport fails before an HTTP response
- **WHEN** a local OpenCode HTTP request rejects with an error carrying an underlying transport cause and code
- **THEN** the transcript identifies the request method and API path and retains both the outer error and the underlying cause, code and available stacks rather than only a generic fetch message
- **AND** the worker fails without producing a successful reply or retrying the prompt

#### Scenario: Failure while reading a response
- **WHEN** reading the prompt response body or event subscription fails
- **THEN** the transcript identifies the affected API operation and response-reading failure and retains its available error and cause details

#### Scenario: Cleanup follows a transport failure
- **WHEN** a transport failure is followed by request cancellation or server termination during cleanup
- **THEN** the transcript still contains the originating transport diagnostic and any already-reported usage remains available under the existing adapter accounting rules
