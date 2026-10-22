package chat.mural

import chat.mural.network.HostedAPIClient
import chat.mural.network.HostedFailure
import org.junit.Assert.assertEquals
import org.junit.Test

class LicenseErrorMessageTest {
    @Test fun serverLicenseCodesSurviveSanitisingAndMapToTheirOwnMessages() {
        val expected = mapOf(
            "license_not_licensed" to R.string.hosted_license_missing,
            "license_suspended" to R.string.hosted_license_suspended,
            "license_not_started" to R.string.hosted_license_not_started,
            "license_expired" to R.string.hosted_license_expired,
        )
        for ((code, message) in expected) {
            assertEquals(code, HostedAPIClient.safeErrorCode(code))
            assertEquals(code, message, hostedErrorMessageRes(HostedFailure.Http(403, code)))
        }
        assertEquals(null, HostedAPIClient.safeErrorCode("license_something_else"))
    }
}
