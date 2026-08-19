import java.util.Properties

// Release signing. Absent on a fresh clone and in CI, where an unsigned or
// debug-signed build is the honest outcome rather than a hard failure.
val keystoreProperties = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.methou.myfinance"
    // Pinned above flutter.compileSdkVersion (36) because flutter_secure_storage
    // requires 37. AGP 9.1 warns that 36 is its highest recommended value; the
    // warning is expected and the build is clean. Revert to
    // flutter.compileSdkVersion once Flutter's default catches up.
    compileSdk = 37
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by flutter_local_notifications, which uses java.time on
        // API levels that predate it.
        isCoreLibraryDesugaringEnabled = true
    }

    // Only the home-screen widget uses Compose. Flutter draws everything
    // inside the app itself; a widget is rendered by the launcher, in another
    // process, so it cannot be Flutter and has to be native.
    buildFeatures {
        compose = true
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.methou.myfinance"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            // The keystore lives outside the repository and key.properties is
            // gitignored: a signing key in version control is a signing key
            // anyone with the repo can use.
            keystoreProperties["storeFile"]?.let { storeFile = file(it) }
            storePassword = keystoreProperties["storePassword"] as String?
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
        }
    }

    buildTypes {
        release {
            // Falls back to the debug key when no keystore is configured, so a
            // clone can still produce a running APK. An install signed with a
            // different key cannot upgrade one signed with this one, which is
            // why the real key has to be kept and backed up.
            signingConfig = if (keystoreProperties.isEmpty) {
                signingConfigs.getByName("debug")
            } else {
                signingConfigs.getByName("release")
            }
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")

    // org.json is part of Android but only a throwing stub on the JVM, so the
    // real implementation has to be on the unit-test classpath for the payload
    // parser to be testable without a device.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20250107")

    implementation("androidx.glance:glance-appwidget:1.1.1")
    implementation("androidx.glance:glance-material3:1.1.1")

    // Already on the runtime classpath through home_widget and workmanager;
    // declared here because the ↻ button has to reach WorkManager directly to
    // clear a poisoned work chain. Pinned to the version those plugins resolve
    // to, so this declaration never decides the version for anyone else.
    implementation("androidx.work:work-runtime-ktx:2.11.2")
}

flutter {
    source = "../.."
}
