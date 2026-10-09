package expo.modules.downloadsaver

import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

// Saves an app-owned cache file into the public Downloads collection without a
// folder picker. Android 10+ lets an app insert its own files into
// MediaStore.Downloads with no storage permission; older versions are reported
// as unsupported so the caller can fall back to the system picker.
class DownloadSaverModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("DownloadSaver")

    Function("isSupported") { Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q }

    AsyncFunction("saveToDownloads") { sourceUri: String, displayName: String, mimeType: String, folder: String ->
      check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { "Saving to Downloads needs Android 10 or newer." }
      val ctx = context()
      val source = File(requireNotNull(Uri.parse(sourceUri).path)).canonicalFile
      check(source.path.startsWith(ctx.cacheDir.canonicalPath) && source.isFile) { "Invalid file to save." }
      val resolver = ctx.contentResolver
      val values = ContentValues().apply {
        put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
        put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
        put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$folder")
        put(MediaStore.MediaColumns.IS_PENDING, 1)
      }
      val target = requireNotNull(resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)) {
        "Could not create the download."
      }
      try {
        requireNotNull(resolver.openOutputStream(target)) { "Could not open the download." }.use { output ->
          source.inputStream().use { input -> input.copyTo(output) }
        }
        resolver.update(target, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      } catch (error: Exception) {
        // Remove only the incomplete entry this call created.
        resolver.delete(target, null, null)
        throw error
      }
      // MediaStore may rename on collision (for example "name (1).pdf").
      val savedName = resolver.query(target, arrayOf(MediaStore.MediaColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      } ?: displayName
      mapOf("uri" to target.toString(), "name" to savedName, "folder" to "${Environment.DIRECTORY_DOWNLOADS}/$folder")
    }
  }
}
