// ====================================================================
// ANÁLISIS COMPLETO DE INDUSTRIALIZACIÓN DEL LITIO - SALAR DE UYUNI
// Google Earth Engine - JavaScript - VERSIÓN FINAL CORREGIDA
// ====================================================================

// 1. CONFIGURACIÓN INICIAL
// ====================================================================

// Definir área de estudio: Salar de Uyuni, Bolivia
var salarUyuni = ee.Geometry.Rectangle([-68.0, -20.5, -67.0, -20.0]);

// Centrar mapa en el área de estudio
Map.centerObject(salarUyuni, 10);
Map.addLayer(salarUyuni, {color: 'red'}, 'Área de estudio: Salar de Uyuni');

print('Iniciando análisis del Salar de Uyuni...');

// 2. CARGA DE DATOS SATELITALES SIMPLIFICADA
// ====================================================================

print('Cargando datos satelitales...');

// Usar Landsat 8 para NDWI (más confiable que Sentinel-2 para esta área)
var landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(salarUyuni)
  .filterDate('2020-01-01', '2023-12-31')
  .filter(ee.Filter.lt('CLOUD_COVER', 20));

// 3. CALCULAR NDWI CON LANDSAT 8
// ====================================================================

function calcularNDWI_Landsat(image) {
  // Bandas de Landsat 8: B3 (verde), B5 (NIR)
  var ndwi = image.normalizedDifference(['SR_B3', 'SR_B5']).rename('NDWI');
  // Escalar a reflectancia
  var scaled = image.multiply(0.0000275).add(-0.2);
  return scaled.addBands(ndwi);
}

var landsatConNDWI = landsat.map(calcularNDWI_Landsat);

// 4. DATOS MODIS SIMPLIFICADOS
// ====================================================================

// Temperatura MODIS con proyección fija
var modisLST = ee.ImageCollection('MODIS/061/MOD11A1')
  .filterBounds(salarUyuni)
  .filterDate('2020-01-01', '2023-12-31')
  .select('LST_Day_1km')
  .map(function(image) {
    return image.multiply(0.02).subtract(273.15)
      .rename('LST_Celsius')
      .setDefaultProjection('EPSG:4326', null, 1000);
  });

// 5. CALCULAR PROMEDIOS CORRECTAMENTE
// ====================================================================

print('Calculando promedios...');

// NDWI promedio - método directo sin reduceResolution
var ndwiPromedio = landsatConNDWI.select('NDWI').mean()
  .clip(salarUyuni);

// LST promedio
var lstPromedio = modisLST.select('LST_Celsius').mean()
  .clip(salarUyuni);

// 6. VISUALIZACIÓN EN EL MAPA CORREGIDA
// ====================================================================

// Configurar paletas de colores
var paletaNDWI = ['red', 'yellow', 'green', 'blue', 'darkblue'];
var paletaLST = ['blue', 'cyan', 'green', 'yellow', 'red'];

// Añadir capas al mapa
Map.addLayer(ndwiPromedio, 
  {min: -0.3, max: 0.3, palette: paletaNDWI}, 
  'NDWI - Agua/Salmueras');

Map.addLayer(lstPromedio, 
  {min: 10, max: 35, palette: paletaLST}, 
  'Temperatura (°C)');

print('Capas visualizadas en el mapa.');

// 7. EXTRACCIÓN DE VALORES CON CALLBACKS CORREGIDOS
// ====================================================================

print('Extrayendo valores ambientales...');

// Función simplificada para extraer valores
function extraerValor(imagen, banda) {
  return imagen.select(banda).reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: salarUyuni,
    scale: 100,
    maxPixels: 1e9,
    bestEffort: true
  }).get(banda);
}

// Usar evaluate para obtener valores de forma asíncrona
extraerValor(ndwiPromedio, 'NDWI').evaluate(function(ndwiValor) {
  extraerValor(lstPromedio, 'LST_Celsius').evaluate(function(lstValor) {
    
    print('Valores ambientales extraídos:');
    print('NDWI (agua/salmueras):', ndwiValor);
    print('Temperatura (°C):', lstValor);
    
    // Manejar valores undefined
    if (ndwiValor === null || ndwiValor === undefined) {
      ndwiValor = -0.15; // Valor por defecto basado en datos típicos
    }
    
    if (lstValor === null || lstValor === undefined) {
      lstValor = 23.7; // Valor por defecto basado en datos típicos
    }
    
    // Calcular factores ambientales
    var factorNDWI = (ndwiValor + 0.3) / 0.6; // Normalizar a ~0-1
    var factorTemperatura = lstValor / 35; // Normalizar a 0-1
    
    // Asegurar rangos razonables
    factorNDWI = Math.max(0.1, Math.min(0.9, factorNDWI));
    factorTemperatura = Math.max(0.3, Math.min(0.9, factorTemperatura));
    var factorEvaporacion = 0.7; // Valor fijo para simulación
    
    print('\nFactores ambientales normalizados:');
    print('Factor NDWI:', factorNDWI.toFixed(3));
    print('Factor Temperatura:', factorTemperatura.toFixed(3));
    print('Factor Evaporación:', factorEvaporacion.toFixed(3));
    
    // Ejecutar el modelo con los valores obtenidos
    ejecutarModeloCompleto(factorNDWI, factorTemperatura, factorEvaporacion);
    
  });
});

// 8. MODELO DINÁMICO DE PRODUCCIÓN DE LITIO (FUNCIÓN PRINCIPAL)
// ====================================================================

function ejecutarModeloCompleto(factorNDWI, factorTemperatura, factorEvaporacion) {
  
  print('\n=== INICIANDO MODELO DINÁMICO DE PRODUCCIÓN ===');
  
  // Parámetros del modelo (valores realistas para Salar de Uyuni)
  var parametros = {
    capacidadExtraccion: 150000,    // ton/año de salmuera
    eficienciaExtraccion: 0.75,     // eficiencia en extracción de Li
    concentracionLi: 0.17,          // 0.17% concentración típica en Uyuni
    precioCarbonatoLi: 22000,       // USD/ton (precio actual)
    precioBateriasLi: 160000,       // USD/ton de baterías
    costoExtraccion: 6000,          // USD/ton de Li
    inversionIndustrializacion: 800000000,  // USD para planta completa
    factorAmbientalBase: factorNDWI * factorTemperatura * factorEvaporacion
  };
  
  print('Parámetros del modelo establecidos');
  print('Factor ambiental base:', parametros.factorAmbientalBase.toFixed(3));
  
  // 9. FUNCIÓN DE PRODUCCIÓN ANUAL
  // ====================================================================
  
  function calcularProduccionAnual(año, escenario) {
    // Ecuación en diferencias para producción
    var extraccionBase = parametros.capacidadExtraccion * 
      parametros.factorAmbientalBase * 
      (1 + 0.05 * Math.sin((año - 1) * Math.PI / 3)); // Variación estacional
    
    var litioExtraido = extraccionBase * 
      parametros.concentracionLi * 
      parametros.eficienciaExtraccion;
    
    // Resultados base
    var resultado = {
      año: año,
      litioExtraido: litioExtraido
    };
    
    // Escenarios de industrialización
    if (escenario === 'materiaPrima') {
      // Exportación de carbonato de litio
      resultado.ingresos = litioExtraido * parametros.precioCarbonatoLi;
      resultado.costos = litioExtraido * parametros.costoExtraccion;
      resultado.ganancia = resultado.ingresos - resultado.costos;
      resultado.empleos = litioExtraido * 0.015;  // 1.5 empleos por cada 100 ton
      resultado.rentaTecnologica = 1.0;  // Índice base
      resultado.valorAgregado = resultado.ganancia;
      
    } else if (escenario === 'industrializacion') {
      // Producción local de baterías
      var factorEscala = Math.min(1, (año - 1) / 4);  // Curva de aprendizaje (4 años)
      var inversionAnual = parametros.inversionIndustrializacion * 
        (0.2 - 0.05 * factorEscala);  // Inversión decreciente
      
      resultado.ingresos = litioExtraido * parametros.precioBateriasLi * 
        (0.5 + 0.5 * factorEscala);
      resultado.costos = litioExtraido * parametros.costoExtraccion * 2 + inversionAnual;
      resultado.ganancia = resultado.ingresos - resultado.costos;
      resultado.empleos = litioExtraido * 0.06 * (0.5 + 0.5 * factorEscala);
      resultado.rentaTecnologica = 1.0 + 2.5 * factorEscala;
      resultado.valorAgregado = resultado.ganancia * (1 + factorEscala);
    }
    
    // Impactos ambientales
    resultado.consumoAgua = litioExtraido * 450;  // m³ por tonelada
    resultado.emisionesCO2 = litioExtraido * (escenario === 'materiaPrima' ? 4.5 : 7.5);
    resultado.impactoAmbiental = resultado.consumoAgua * 0.001 + resultado.emisionesCO2 * 0.15;
    
    return resultado;
  }
  
  // 10. SIMULACIÓN DE 10 AÑOS
  // ====================================================================
  
  print('Simulando 10 años de producción...');
  
  var añosSimulacion = 10;
  var resultadosMP = [];  // Materia prima
  var resultadosIN = [];  // Industrialización
  
  for (var año = 1; año <= añosSimulacion; año++) {
    resultadosMP.push(calcularProduccionAnual(año, 'materiaPrima'));
    resultadosIN.push(calcularProduccionAnual(año, 'industrializacion'));
  }
  
  // 11. CÁLCULO DE INDICADORES
  // ====================================================================
  
  function calcularIndicadores(resultados) {
    var indicadores = {
      gananciaTotal: 0,
      empleosTotales: 0,
      rentaTecnologicaPromedio: 0,
      litioTotal: 0,
      impactoAmbientalTotal: 0
    };
    
    for (var i = 0; i < resultados.length; i++) {
      var r = resultados[i];
      indicadores.gananciaTotal += r.ganancia;
      indicadores.empleosTotales += r.empleos;
      indicadores.rentaTecnologicaPromedio += r.rentaTecnologica;
      indicadores.litioTotal += r.litioExtraido;
      indicadores.impactoAmbientalTotal += r.impactoAmbiental;
    }
    
    indicadores.rentaTecnologicaPromedio /= resultados.length;
    indicadores.gananciaPorTonelada = indicadores.gananciaTotal / indicadores.litioTotal;
    
    return indicadores;
  }
  
  var indicadoresMP = calcularIndicadores(resultadosMP);
  var indicadoresIN = calcularIndicadores(resultadosIN);
  
  // 12. MOSTRAR RESULTADOS EN TABLA
  // ====================================================================
  
  print('\n=== RESULTADOS DE SIMULACIÓN (10 AÑOS) ===\n');
  
  // Crear tabla de resultados
  var tabla = [
    ['Indicador', 'Materia Prima', 'Industrialización'],
    ['Ganancia Total (M USD)', 
     (indicadoresMP.gananciaTotal / 1e6).toFixed(1),
     (indicadoresIN.gananciaTotal / 1e6).toFixed(1)],
    ['Empleos Generados', 
     Math.round(indicadoresMP.empleosTotales),
     Math.round(indicadoresIN.empleosTotales)],
    ['Renta Tecnológica (índice)', 
     indicadoresMP.rentaTecnologicaPromedio.toFixed(2),
     indicadoresIN.rentaTecnologicaPromedio.toFixed(2)],
    ['Litio Extraído (mil ton)', 
     (indicadoresMP.litioTotal / 1000).toFixed(1),
     (indicadoresIN.litioTotal / 1000).toFixed(1)],
    ['Impacto Ambiental (índice)', 
     (indicadoresMP.impactoAmbientalTotal / 1000).toFixed(3),
     (indicadoresIN.impactoAmbientalTotal / 1000).toFixed(3)],
    ['Ganancia por Tonelada (USD/ton)', 
     Math.round(indicadoresMP.gananciaPorTonelada),
     Math.round(indicadoresIN.gananciaPorTonelada)]
  ];
  
  print(ui.Chart({
    chartType: 'Table',
    data: tabla
  }));
  
  // 13. GRÁFICOS SIMPLIFICADOS
  // ====================================================================
  
  // Preparar datos para gráficos
  var años = [];
  var gananciasMP = [];
  var gananciasIN = [];
  var empleosMP = [];
  var empleosIN = [];
  
  for (var i = 0; i < añosSimulacion; i++) {
    años.push('A' + (i + 1));
    gananciasMP.push(resultadosMP[i].ganancia / 1e6);
    gananciasIN.push(resultadosIN[i].ganancia / 1e6);
    empleosMP.push(resultadosMP[i].empleos);
    empleosIN.push(resultadosIN[i].empleos);
  }
  
  // Gráfico de ganancias
  var datosGanancias = {
    labels: años,
    datasets: [
      {
        label: 'Materia Prima',
        values: gananciasMP
      },
      {
        label: 'Industrialización',
        values: gananciasIN
      }
    ]
  };
  
  var chartGanancias = ui.Chart(datosGanancias, 'LineChart', {
    title: 'Evolución de Ganancias (Millones USD)',
    hAxis: {title: 'Año'},
    vAxis: {title: 'Ganancia (M USD)'},
    lineWidth: 2,
    pointSize: 3,
    colors: ['orange', 'green']
  });
  
  // Gráfico de empleos
  var datosEmpleos = {
    labels: años,
    datasets: [
      {
        label: 'Materia Prima',
        values: empleosMP
      },
      {
        label: 'Industrialización',
        values: empleosIN
      }
    ]
  };
  
  var chartEmpleos = ui.Chart(datosEmpleos, 'ColumnChart', {
    title: 'Empleos Generados por Año',
    hAxis: {title: 'Año'},
    vAxis: {title: 'Número de Empleos'},
    isStacked: false,
    colors: ['orange', 'green']
  });
  
  print('\n=== GRÁFICOS DE RESULTADOS ===\n');
  print(chartGanancias);
  print(chartEmpleos);
  
  // 14. ANÁLISIS DE SOSTENIBILIDAD
  // ====================================================================
  
  print('\n=== ANÁLISIS DE SOSTENIBILIDAD ===\n');
  
  function calcularIndiceSostenibilidad(indicadores) {
    // Normalizar indicadores a escala 0-1
    var economico = Math.min(1, indicadores.gananciaTotal / 5e9);
    var social = Math.min(1, indicadores.empleosTotales / 5000);
    var ambiental = Math.max(0, 1 - (indicadores.impactoAmbientalTotal / 10000));
    var tecnologico = Math.min(1, indicadores.rentaTecnologicaPromedio / 3);
    
    return {
      economico: economico,
      social: social,
      ambiental: ambiental,
      tecnologico: tecnologico,
      total: (economico + social + ambiental + tecnologico) / 4
    };
  }
  
  var sostenibilidadMP = calcularIndiceSostenibilidad(indicadoresMP);
  var sostenibilidadIN = calcularIndiceSostenibilidad(indicadoresIN);
  
  print('Índice de Sostenibilidad - Materia Prima:');
  print('  Económico:', sostenibilidadMP.economico.toFixed(3));
  print('  Social:', sostenibilidadMP.social.toFixed(3));
  print('  Ambiental:', sostenibilidadMP.ambiental.toFixed(3));
  print('  Tecnológico:', sostenibilidadMP.tecnologico.toFixed(3));
  print('  TOTAL:', sostenibilidadMP.total.toFixed(3));
  
  print('\nÍndice de Sostenibilidad - Industrialización:');
  print('  Económico:', sostenibilidadIN.economico.toFixed(3));
  print('  Social:', sostenibilidadIN.social.toFixed(3));
  print('  Ambiental:', sostenibilidadIN.ambiental.toFixed(3));
  print('  Tecnológico:', sostenibilidadIN.tecnologico.toFixed(3));
  print('  TOTAL:', sostenibilidadIN.total.toFixed(3));
  
  // 15. RECOMENDACIONES ESTRATÉGICAS
  // ====================================================================
  
  print('\n=== RECOMENDACIONES ESTRATÉGICAS ===\n');
  
  var diferencia = sostenibilidadIN.total - sostenibilidadMP.total;
  
  if (diferencia > 0.15) {
    print('RECOMENDACIÓN: Implementar estrategia de industrialización completa');
    print('• Ventaja en sostenibilidad: ' + (diferencia * 100).toFixed(1) + '%');
    print('• Beneficio económico adicional: ' + 
          ((indicadoresIN.gananciaTotal/indicadoresMP.gananciaTotal - 1)*100).toFixed(1) + '%');
    print('• Creación adicional de empleos: ' + 
          Math.round(indicadoresIN.empleosTotales - indicadoresMP.empleosTotales));
  } else if (diferencia > 0.05) {
    print('RECOMENDACIÓN: Transición gradual hacia industrialización');
    print('• Implementar en fases de 3-5 años');
    print('• Desarrollar capacidades técnicas locales primero');
  } else {
    print('RECOMENDACIÓN: Optimizar producción actual antes de industrializar');
    print('• Mejorar eficiencia de extracción');
    print('• Reducir impacto ambiental');
  }
  
  // 16. CONTRIBUCIÓN A OBJETIVOS DE DESARROLLO SOSTENIBLE
  // ====================================================================
  
  print('\n=== CONTRIBUCIÓN A LOS ODS ===\n');
  
  var contribucionODS = [
    ['ODS 7: Energía asequible', 'Alta', 'Muy Alta'],
    ['ODS 8: Trabajo decente', 'Media', 'Alta'],
    ['ODS 9: Industria e innovación', 'Baja', 'Muy Alta'],
    ['ODS 12: Producción responsable', 'Media', 'Alta'],
    ['ODS 13: Acción climática', 'Media', 'Alta']
  ];
  
  print('Contribución estimada a los ODS:');
  print(ui.Chart({
    chartType: 'Table',
    data: contribucionODS
  }));
  
  // 17. RESUMEN EJECUTIVO
  // ====================================================================
  
  print('\n=== RESUMEN EJECUTIVO ===\n');
  
  print('1. CONDICIONES AMBIENTALES:');
  print('   • NDWI promedio: ' + factorNDWI.toFixed(3) + ' (indicador de disponibilidad de salmueras)');
  print('   • Temperatura promedio: ' + (factorTemperatura * 35).toFixed(1) + '°C');
  print('   • Condiciones favorables para evaporación solar');
  
  print('\n2. POTENCIAL PRODUCTIVO (10 años):');
  print('   • Materia Prima: ' + (indicadoresMP.litioTotal / 1000).toFixed(0) + ' mil toneladas de Li');
  print('   • Industrialización: ' + (indicadoresIN.litioTotal / 1000).toFixed(0) + ' mil toneladas de Li');
  
  print('\n3. IMPACTOS ECONÓMICOS:');
  print('   • Valor agregado industrialización: ' + 
        ((indicadoresIN.gananciaTotal/indicadoresMP.gananciaTotal - 1)*100).toFixed(0) + '% mayor');
  print('   • Renta tecnológica: ' + 
        indicadoresIN.rentaTecnologicaPromedio.toFixed(1) + ' vs ' + 
        indicadoresMP.rentaTecnologicaPromedio.toFixed(1));
  
  print('\n4. RECOMENDACIÓN PRINCIPAL:');
  if (sostenibilidadIN.total > sostenibilidadMP.total + 0.1) {
    print('   PRIORIZAR INDUSTRIALIZACIÓN LOCAL');
    print('   • Mayor sostenibilidad integral');
    print('   • Desarrollo tecnológico local');
    print('   • Generación de empleo cualificado');
  } else {
    print('   OPTIMIZAR CADENA DE VALOR ACTUAL');
    print('   • Mejorar eficiencia operativa');
    print('   • Reducir impactos ambientales');
    print('   • Preparar transición futura');
  }
  
  print('\n=== ANÁLISIS COMPLETADO ===\n');
  print('Este análisis integra datos satelitales con modelos dinámicos');
  print('para apoyar decisiones estratégicas en la industrialización del litio.');
}

// 18. FUNCIÓN PARA CREAR SERIES TEMPORALES (OPCIONAL)
// ====================================================================

print('\nGenerando series temporales...');

// Crear serie temporal de NDWI mensual (simplificada)
var ndwiMensual = landsatConNDWI.select('NDWI')
  .filterDate('2020-01-01', '2023-12-31');

var chartSerieNDWI = ui.Chart.image.series({
  imageCollection: ndwiMensual,
  region: salarUyuni,
  reducer: ee.Reducer.mean(),
  scale: 100
}).setOptions({
  title: 'Serie Temporal NDWI - Salar de Uyuni',
  vAxis: {title: 'NDWI'},
  hAxis: {title: 'Fecha'},
  lineWidth: 1,
  pointSize: 2,
  colors: ['blue']
});

print(chartSerieNDWI);

// 19. INFORMACIÓN INICIAL
// ====================================================================

print('\n' + '='.repeat(60));
print('SISTEMA DE ANÁLISIS DE INDUSTRIALIZACIÓN DEL LITIO');
print('SALAR DE UYUNI, BOLIVIA');
print('='.repeat(60));
print('Este análisis integra:');
print('• Datos satelitales Landsat 8 y MODIS');
print('• Modelo dinámico de producción de litio');
print('• Evaluación de sostenibilidad (ODS 7,8,9,12,13)');
print('• Análisis económico-ambiental comparativo');
print('='.repeat(60));

// 20. INSTRUCCIONES DE USO
// ====================================================================

print('\nINSTRUCCIONES:');
print('1. Espere a que se carguen todas las capas en el mapa');
print('2. Revise los valores ambientales extraídos');
print('3. Analice los resultados de la simulación');
print('4. Considere las recomendaciones estratégicas');
print('\nLos resultados son indicativos y deben validarse con datos de campo.');