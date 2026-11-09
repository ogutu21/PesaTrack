plugins { id("com.android.application") }
android {
    namespace = "app.pesatrack"
    compileSdk = 34
    defaultConfig {
        applicationId = "app.pesatrack"
        minSdk = 24
        targetSdk = 34
        versionCode = 2
        versionName = "0.2"
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
