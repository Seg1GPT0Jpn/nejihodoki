plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "jp.himatsubushi.guard"
    compileSdk = 34

    defaultConfig {
        applicationId = "jp.himatsubushi.guard"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        resourceConfigurations += listOf("ja", "en")
    }

    // 更新インストールができるよう、CI では同じ鍵で署名できる（環境変数があるときだけ）。なければデバッグ鍵。
    val ksPath = System.getenv("GUARD_KEYSTORE_PATH")
    if (!ksPath.isNullOrBlank()) {
        signingConfigs {
            create("owner") {
                storeFile = file(ksPath)
                storePassword = System.getenv("GUARD_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("GUARD_KEY_ALIAS")
                keyPassword = System.getenv("GUARD_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            if (!ksPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("owner")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (!ksPath.isNullOrBlank()) signingConfig = signingConfigs.getByName("owner")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    buildFeatures { buildConfig = true }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation(project(":core"))
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
}
