# El modelo

Cómo se prepara, qué entra, qué sale y por qué. El contrato que produce está en
[api-contrato.md](api-contrato.md); esto es lo que hay detrás.

Todo lo de aquí se genera desde [`notebooks/01-entrenar-y-exportar.ipynb`](../notebooks/01-entrenar-y-exportar.ipynb).

---

## Las trece features — una decisión de producto

No son las que dan el mejor recall. Son **las que alguien puede contestar sobre un pasajero**
sin tener el dataset completo delante.

| Feature | Tipo | De dónde sale |
|---|---|---|
| `HomePlanet`, `Destination` | `cat` | Del CSV |
| `CryoSleep` | `bool` | Del CSV |
| `Age`, `RoomService`, `FoodCourt`, `ShoppingMall`, `Spa`, `VRDeck` | `num` | Del CSV |
| `Cabin_Deck`, `Cabin_Side` | `cat` | De abrir `Cabin` (`B/0/P`) |
| `Cabin_Num` | `num` | De abrir `Cabin` |
| `GroupSize` | `num` | Del prefijo de `PassengerId` (`0001_01`) |

Lo que se queda fuera, y por qué:

| Columna | Razón |
|---|---|
| `Name`, `PassengerId` | Identificadores únicos, sin valor predictivo |
| `VIP` | 97.7% en `False`; el crosstab no mostró diferencia concluyente |
| `Cabin` | Redundante tras extraer sus tres componentes; cardinalidad 6560 |

`GroupSize` sí está aunque no venga en el CSV: es información que el pasajero conoce —con
cuánta gente viaja— y el patrón de grupo resultó útil en el EDA.

---

## El pipeline

Un solo objeto, y todo el conocimiento del modelo vive dentro.

```
       entrada cruda del contrato (13 columnas)
                     │
   ┌─────────────────▼─────────────────────────────────────┐
   │ derivar        TotalSpent, HasSpent, IsChild, IsAlone,  │
   │                log1p de los consumos, arreglo de        │
   │                CryoSleep, fusión de la cubierta T       │
   ├────────────────────────────────────────────────────────┤
   │ preproceso     imputar(mediana) + RobustScaler   (continuas)
   │                imputar(moda) + OneHot            (nominales)
   │                imputar(moda)                     (binarias)
   ├────────────────────────────────────────────────────────┤
   │ estimador      XGBClassifier                            │
   └────────────────────────────────────────────────────────┘
                     │
                  0 ó 1  +  probabilidades
```

El servicio le pasa un `DataFrame` crudo y recibe una clase. No imputa, no escala, no
codifica y no deriva: si tuviera que hacerlo, la exportación estaría mal hecha.

### Decisiones de preparación

**`CryoSleep` es un faltante informativo.** Un pasajero en criosueño no puede gastar. Si
`CryoSleep` falta pero hay consumo registrado, era `False`. Y al revés: si está en criosueño,
un consumo faltante es un **cero**, no un desconocido — imputar la mediana ahí sería inventar
gasto. Esto recupera cerca del 60% de los faltantes de esa columna.

**`log1p` en las cinco cuentas de consumo.** Sesgo de entre 6 y 12 en crudo, por la enorme
cantidad de ceros. `log1p` mapea el 0 a 0, conserva el orden y comprime la cola sin borrar los
extremos.

**`RobustScaler` y no `StandardScaler`.** Después del `log1p` siguen quedando valores
extremos, sobre todo en `Age`. `RobustScaler` usa mediana y rango intercuartil.

**La cubierta `T` se funde con la `D`.** Cinco registros en todo el dataset: dejarla sola
invita al modelo a aprender una relación espuria. El contrato no la ofrece en `allowed`, para
que el formulario no permita elegir un valor que el pipeline convierte en otro a sus espaldas.

**`handle_unknown="ignore"` en el one-hot.** Si llega una categoría que el modelo no vio, la
fila se codifica en ceros y la predicción sale, en lugar de tumbar el servicio. El aviso de
"valor no visto" ya lo da la validación del contrato.

### Lo que se perdió al meter todo en el pipeline

En el primer avance, `HomePlanet` se imputaba con **la moda del grupo de viaje**. Aquí no se
puede: el servicio predice un pasajero a la vez y no tiene el grupo delante. Se imputa con la
moda global.

Es una pérdida real de señal, y es el precio de que el modelo funcione fuera del notebook.
De ahí sale la regla dura del artefacto: **toda la derivación es por fila.** Ni un `groupby`.
Tiene que dar el mismo resultado con 8 693 filas al entrenar que con una sola al servir.

---

## Tres conjuntos, estratificados

| | Filas |
|---|---|
| entrenamiento | 6 085 |
| validación | 1 304 |
| prueba | 1 304 |

Entrenamiento para aprender, validación para decidir, prueba para reportar. La prueba se toca
una sola vez. `stratify=y` mantiene el balance (50.36% / 49.64%) en los tres.

---

## Por qué recall, y no accuracy

Un falso negativo y un falso positivo no cuestan lo mismo. **Un falso negativo es un pasajero
transportado que el sistema reporta a salvo:** no se despliega ninguna búsqueda para él. Un
falso positivo solo moviliza recursos de más.

Por eso la métrica de decisión es **recall**, con **F1** de filtro para que maximizar recall no
degenere en predecir todo positivo.

`scale_pos_weight=2` es lo que desplaza el punto de operación hacia ese lado. **No corrige
desbalance** —las clases están a 50/50— sino que mete una decisión de producto dentro de la
función de pérdida. Por eso viaja dentro del artefacto.

### Comparativa (sobre validación, mismo pipeline y mismo split)

| Modelo | recall ★ | f1 | FN | FP |
|---|---|---|---|---|
| Baseline (clase mayoritaria) | 1.0000 | 0.6694 | 0 | 648 |
| RandomForest | 0.7866 | 0.8075 | 140 | 106 |
| **XGBoost** | **0.9146** | **0.8163** | **56** | **214** |

El baseline no es decoración: predecir siempre "Transportado" da 100% de recall y 0% de
specificity. Sin esa fila delante es fácil no notar que un recall alto puede no significar
nada.

Los 22 experimentos de hiperparámetros están en `metadata.json` y se renderizan en la
Model Card. Las filas de `scale_pos_weight` son las que muestran el trade-off completo: el
recall sube y la specificity baja, monótonamente.

---

## Qué pesa en el modelo

Dos vistas, y hacen falta las dos.

**Atribuido a los campos del formulario** (`feature_importances`) — es lo que alimenta la
explicación y el historial, porque tiene que nombrar campos que el usuario reconoce:

```
RoomService   15.4%    Spa   14.0%    VRDeck   13.3%    FoodCourt   13.3%    ShoppingMall   13.0%
```

**Como las ve el modelo** (`derived_importances`) — sin repartir:

```
HasSpent          53.2%   #############################
CryoSleep         12.1%   ######
HomePlanet         8.1%   ####
RoomService_log    4.6%   ##
Cabin_Deck         4.2%   ##
```

**`HasSpent` —una sola columna derivada— es más de la mitad del modelo.** Repartir su peso
entre las cinco cuentas de consumo, como hace la primera vista, haría que la tabla dijera
*"RoomService, 15%"* cuando lo que el modelo usa es *"gastó algo o no"*.

Esto matiza la conclusión del EDA. Ahí `CryoSleep` aparecía como la variable con mayor poder
discriminante (81.8% contra 32.9%). Con el modelo entrenado resulta que `HasSpent` la
desplaza: es un proxy suyo —quien está en criosueño no gasta— pero **más informativo**, porque
también captura a los pasajeros despiertos que no consumieron nada.

---

## El artefacto son cuatro archivos

```
artifacts/
├── pipeline.joblib     el Pipeline completo
├── derivadas.py        el módulo de columnas derivadas
├── metadata.json       el contrato
└── example.json        un input válido y su predicción de referencia
```

`derivadas.py` no es opcional. `joblib` no serializa el código de una función: guarda una
referencia con su nombre (`derivadas.derivar`). Si el pipeline lleva un `FunctionTransformer`
y ese módulo no se puede importar al cargarlo, joblib falla con `No module named 'derivadas'`.
El servicio pone `MODEL_PATH` en `sys.path` antes de deserializar.

Dos consecuencias:

1. **Si cambias `derivar()`, hay que volver a exportar el pipeline.** El `artifact_hash` es lo
   que te deja notarlo: si el hash que reporta `/api/health` no es el de tu `metadata.json`,
   están sirviendo otra cosa.
2. **La máquina que sirve necesita `xgboost` instalado.** Por la misma razón: joblib guarda
   una referencia a la clase, no su código.

---

## La prueba que lo amarra todo

```bash
./setup/run test paridad
```

Comprueba que el notebook y el servicio devuelven **la misma clase y las mismas
probabilidades** para la misma entrada. Comparar solo la etiqueta no bastaría: un pipeline con
las probabilidades corridas da la misma clase en casi todos los casos y falla justo en los que
están cerca del umbral, que son los que importan.

Además verifica que `classes` del contrato coincida con `pipeline.classes_`, que el backend no
mencione `expm1`, `log1p`, `OneHotEncoder`, `StandardScaler`, `RobustScaler` ni `SimpleImputer`
—si lo hiciera, alguien movió conocimiento del modelo al código que lo consume— y que el
artefacto no arrastre rutas absolutas del entorno de entrenamiento.
