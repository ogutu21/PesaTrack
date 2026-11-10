plugins { id("com.android.application") }
android {
    namespace = "app.pesatrack"
    compileSdk = 34
    defaultConfig {
        applicationId = "app.pesatrack"
        minSdk = 24
        targetSdk = 34
        versionCode = 8
        versionName = "0.6.1"
    }
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")   // fixed key, so new builds install over old ones
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies {
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}
