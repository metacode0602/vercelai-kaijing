import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { federationClientId } from "./federation-constants"

describe("federationClientId", () => {
  it("prefixes the external org id verbatim", () => {
    assert.equal(federationClientId("org_abc123"), "openmcp-org_abc123")
    assert.equal(federationClientId("Acme Robotics"), "openmcp-Acme Robotics")
  })
})
