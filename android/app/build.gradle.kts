plugins { id("com.android.application") }
android {
    namespace = "app.pesatrack"
    compileSdk = 34
    defaultConfig {
        applicationId = "app.pesatrack"
        minSdk = 24
        targetSdk = 34
        versionCode = 6
        versionName = "0.5"
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
