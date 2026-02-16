// Fix: Family Members layer doesn't show on initial page load due to race condition
// between maps_controller and family_members_controller Stimulus controllers.
// This script waits for both to be ready and ensures the layer is properly initialized.
(function() {
  var maxAttempts = 50; // 5 seconds max
  var attempt = 0;

  function tryFixFamilyLayer() {
    attempt++;
    var mc = window.mapsController;
    var fc = window.familyMembersController;

    if (!mc || !mc.map || !fc || !fc.familyMarkersLayer) {
      if (attempt < maxAttempts) {
        setTimeout(tryFixFamilyLayer, 100);
      }
      return;
    }

    var enabledLayers = (mc.userSettings && mc.userSettings.enabled_map_layers) || [];
    if (enabledLayers.indexOf("Family Members") === -1) return;

    // Layer should be enabled but isn't on the map — add it and fetch data
    if (!mc.map.hasLayer(fc.familyMarkersLayer)) {
      fc.familyMarkersLayer.addTo(mc.map);
      if (typeof fc.refreshFamilyLocations === 'function') {
        fc.refreshFamilyLocations();
      }
      if (typeof fc.startPeriodicRefresh === 'function') {
        fc.startPeriodicRefresh();
      }
    }
  }

  // Run on turbo:load (Rails 8 uses Turbo) and on initial DOMContentLoaded
  document.addEventListener('turbo:load', function() {
    attempt = 0;
    setTimeout(tryFixFamilyLayer, 500);
  });
  document.addEventListener('DOMContentLoaded', function() {
    attempt = 0;
    setTimeout(tryFixFamilyLayer, 500);
  });
})();
