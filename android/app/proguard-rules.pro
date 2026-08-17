# R8 rules for the release build.
#
# Flutter ships its own rules for the engine, so most of the app needs nothing
# here: the Dart code is compiled ahead of time and is not subject to shrinking.
# What does need protecting is the native Android side, which R8 sees as
# unreachable because nothing in this project calls it — the system does.

# The home-screen widget and its action callback are instantiated by name from
# the AndroidManifest and from Glance. R8 cannot see those references, so
# without this the widget silently disappears from the launcher in release
# builds while working perfectly in debug.
-keep class com.methou.myfinance.widget.** { *; }

# Glance and Compose runtime entry points reached by reflection.
-keep class androidx.glance.appwidget.** { *; }

# WorkManager instantiates workers by class name.
-keep class * extends androidx.work.Worker { *; }
-keep class * extends androidx.work.ListenableWorker { *; }

# org.json is used by the widget's payload parser.
-dontwarn org.json.**
