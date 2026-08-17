package com.methou.myfinance

import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * Hosts the Flutter app.
 *
 * Extends FlutterFragmentActivity rather than FlutterActivity because
 * local_auth shows the biometric prompt through AndroidX BiometricPrompt, which
 * needs a FragmentActivity. With the plain FlutterActivity the app compiles and
 * runs fine and then throws the first time someone is asked to unlock — a
 * failure that only appears on a device, and only on that one code path.
 */
class MainActivity : FlutterFragmentActivity()
