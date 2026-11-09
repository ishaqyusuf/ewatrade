package expo.modules.playagesignals

import com.google.android.play.agesignals.AgeSignalsAccessRequest
import com.google.android.play.agesignals.AgeSignalsManager
import com.google.android.play.agesignals.AgeSignalsManagerFactory
import com.google.android.play.agesignals.AgeSignalsRequest
import com.google.android.play.agesignals.model.AgeRangeSource
import com.google.android.play.agesignals.model.AgeSignalsStatus
import com.google.android.play.agesignals.model.SignificantChangeStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Source-only preparation. Terms/access, policy and signed native review must
// precede a later explicit native source change/build. JS/OTA/env cannot opt in.
private const val RELEASE_ENABLED = false

class PlayAgeSignalsModule : Module() {
  private var sharedAccess = false

  override fun definition() = ModuleDefinition {
    Name("PlayAgeSignals")
    AsyncFunction("requestAccess") { promise: Promise ->
      sharedAccess = false
      if (!RELEASE_ENABLED) {
        promise.resolve(mapOf("kind" to "disabled"))
      } else {
        val activity = appContext.currentActivity
        val context = appContext.reactContext
        if (activity == null || context == null) {
          unavailable(promise)
        } else {
          try {
            val manager = AgeSignalsManagerFactory.create(context.applicationContext)
            val request = AgeSignalsAccessRequest.builder().setActivity(activity).build()
            manager.requestAgeSignalsAccess(request)
              .addOnSuccessListener { access ->
                when (access.ageSignalsStatus()) {
                  AgeSignalsStatus.SHARED -> {
                    sharedAccess = true
                    promise.resolve(mapOf("kind" to "access-shared"))
                  }
                  AgeSignalsStatus.NOT_SHARED -> promise.resolve(mapOf("kind" to "not-shared"))
                  AgeSignalsStatus.VERIFICATION_REQUIRED -> promise.resolve(mapOf("kind" to "verification-required"))
                  else -> promise.resolve(mapOf("kind" to "unknown"))
                }
              }
              .addOnFailureListener { unavailable(promise) }
          } catch (_: Exception) {
            unavailable(promise)
          }
        }
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("readShared") { promise: Promise ->
      val allowed = sharedAccess
      sharedAccess = false
      if (!RELEASE_ENABLED) {
        promise.resolve(mapOf("kind" to "disabled"))
      } else if (!allowed || appContext.reactContext == null) {
        unavailable(promise)
      } else {
        // One access decision permits one read; stale decisions cannot be reused.
        try {
          val manager = AgeSignalsManagerFactory.create(requireNotNull(appContext.reactContext).applicationContext)
          queryShared(manager, promise)
        } catch (_: Exception) {
          unavailable(promise)
        }
      }
    }.runOnQueue(Queues.MAIN)
  }

  private fun queryShared(manager: AgeSignalsManager, promise: Promise) {
    try {
      manager.checkAgeSignals(AgeSignalsRequest.builder().build())
        .addOnSuccessListener { result ->
          // Do not read/export installId, approval date or raw SDK objects.
          // Revocation/significant-change lifecycle integration is still open.
          promise.resolve(mapOf(
            "kind" to "shared",
            "lower" to result.ageLower(),
            "upper" to result.ageUpper(),
            "source" to when (result.ageRangeSource()) {
              AgeRangeSource.TIER_A -> "self-declared"
              AgeRangeSource.TIER_B -> "parent-managed"
              AgeRangeSource.TIER_C -> "assessed"
              AgeRangeSource.TIER_D -> "checked"
              else -> "unknown"
            },
            "change" to when (result.significantChangeStatus()) {
              SignificantChangeStatus.APPROVED -> "approved"
              SignificantChangeStatus.PENDING -> "pending"
              SignificantChangeStatus.DECLINED -> "declined"
              null -> "not-provided"
              else -> "unknown"
            }
          ))
        }
        .addOnFailureListener { unavailable(promise) }
    } catch (_: Exception) {
      unavailable(promise)
    }
  }

  private fun unavailable(promise: Promise) {
    // No exception messages, identity data or raw responses in logs/JS errors.
    promise.resolve(mapOf("kind" to "unavailable"))
  }
}
