from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def test_destination_confirmation_button_is_present_and_bound():
    index = read("templates/index.html")
    js = read("static/vano-map.js")
    css = read("static/vano.css")

    assert 'id="confirmDestinationBtn"' in index
    assert 'Confirmar destino' in index
    assert 'aria-hidden="true"' in index.split('id="destinationConfirm"', 1)[1][:220]
    assert "bindClick('confirmDestinationBtn',confirmDestination)" in js
    assert "setAttribute('aria-hidden','false')" in js
    assert "confirmDestinationBtn')?.focus" in js
    assert ".destination-confirm.show" in css
    assert "z-index:72!important" in css


def test_route_selection_has_explicit_use_route_ctas():
    index = read("templates/index.html")
    js = read("static/vano-map.js")
    css = read("static/vano.css")

    assert 'id="startTripBtn"' in index
    assert 'Usar esta rota' in index
    assert "route-variant-use" in js
    assert "'Usar rota'" in js
    assert "'Rota selecionada'" in js
    assert "Usar esta rota</b>" in js
    assert "VANO ROUTE CTA RESTORE V510" in css
    assert ".route-variant-use" in css
    assert "#routeState .start-trip-cta" in css
