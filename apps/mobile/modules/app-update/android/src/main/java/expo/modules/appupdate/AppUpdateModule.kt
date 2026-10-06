package expo.modules.appupdate

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues
import java.io.File
import java.security.MessageDigest

class AppUpdateFileProvider : FileProvider()

class AppUpdateModule : Module() {
  private fun context() = requireNotNull(appContext.reactContext)
  private fun previewOnly() {
    check(context().packageName == "com.ewatrade.preview") { "Direct installation is only available in preview." }
  }
  override fun definition() = ModuleDefinition {
    Name("AppUpdate")
    Function("identity") {
      val ctx = context()
      val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      mapOf("applicationId" to ctx.packageName, "buildNumber" to
        (if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()).toString())
    }
    Function("canInstall") {
      context().packageName == "com.ewatrade.preview" &&
        (Build.VERSION.SDK_INT < 26 || context().packageManager.canRequestPackageInstalls())
    }
    AsyncFunction("openInstallSettings") {
      previewOnly()
      context().startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
        Uri.parse("package:${context().packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
    // File hashing and package inspection execute off the UI/JS thread.
    AsyncFunction("verifyApk") { uri: String, sha256: String, sizeBytes: Double, buildNumber: Double ->
      previewOnly()
      val ctx = context()
      val file = File(requireNotNull(Uri.parse(uri).path)).canonicalFile
      val directory = File(ctx.cacheDir, "app-updates").canonicalFile
      check(file.parentFile == directory && file.isFile) { "Invalid download location." }
      check(file.length() == sizeBytes.toLong() && file.length() <= 536870912L) { "Download size did not match." }
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input ->
        val buffer = ByteArray(65536)
        while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
      }
      check(digest.digest().joinToString("") { "%02x".format(it) } == sha256) { "Download checksum did not match." }
      val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
      val archive = requireNotNull(ctx.packageManager.getPackageArchiveInfo(file.path, flags)) { "Invalid APK." }
      val installed = ctx.packageManager.getPackageInfo(ctx.packageName, flags)
      check(archive.packageName == ctx.packageName) { "APK belongs to a different app." }
      val target = if (Build.VERSION.SDK_INT >= 28) archive.longVersionCode else archive.versionCode.toLong()
      val current = if (Build.VERSION.SDK_INT >= 28) installed.longVersionCode else installed.versionCode.toLong()
      check(target == buildNumber.toLong() && target > current) { "APK build number did not match." }
      val actualSigners = if (Build.VERSION.SDK_INT >= 28) archive.signingInfo?.apkContentsSigners else archive.signatures
      val installedSigners = if (Build.VERSION.SDK_INT >= 28) installed.signingInfo?.apkContentsSigners else installed.signatures
      check(!actualSigners.isNullOrEmpty() && !installedSigners.isNullOrEmpty() &&
        actualSigners.map { it.toCharsString() }.toSet() == installedSigners.map { it.toCharsString() }.toSet()) {
        "APK signing identity did not match."
      }
      true
    }
    AsyncFunction("installApk") { uri: String ->
      previewOnly()
      val ctx = context()
      check(Build.VERSION.SDK_INT < 26 || ctx.packageManager.canRequestPackageInstalls()) { "Allow installation from this source first." }
      val file = File(requireNotNull(Uri.parse(uri).path)).canonicalFile
      check(file.parentFile == File(ctx.cacheDir, "app-updates").canonicalFile && file.isFile)
      val contentUri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.appupdates", file)
      ctx.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(contentUri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK))
    }.runOnQueue(Queues.MAIN)
  }
}
