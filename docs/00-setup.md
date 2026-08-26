# Setup — hazlo antes de la sesión 1

Buenas noticias: **tu laptop casi no necesita nada.**

No vas a instalar Python, ni Node, ni Docker. Todo eso vive en una máquina Ubuntu en la nube
que vas a crear en la primera sesión. Tu computadora sólo sirve para escribir código y
empujarlo a GitHub.

```
   Tu laptop              GitHub              Tu instancia EC2
   ─────────────          ──────              ────────────────
   VS Code + git   ─push──▶  tu fork  ─pull──▶  Ubuntu
   escribir                                     ahí corre todo
                                     ◀── terminal desde el navegador
```

Eso significa que da exactamente igual si usas Windows o Mac. Es a propósito.

Esto toma unos 15 minutos.

---

## 1. En tu laptop

| Qué | Dónde | Para qué |
| --- | ----- | -------- |
| **git** | [git-scm.com](https://git-scm.com/downloads) | mover tu código a GitHub |
| **VS Code** | [code.visualstudio.com](https://code.visualstudio.com/) | escribir el código |
| **Cuenta de GitHub** | [github.com](https://github.com/) | donde vive tu repositorio |

En macOS, `git` también llega con `xcode-select --install`.

Configura tu identidad de git una sola vez:

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu-correo@tec.mx"
```

---

## 2. Haz fork del repositorio

Entra a **<https://github.com/vsosahdz/TC3009-Part1-2026>** y presiona **Fork**.

Eso te crea tu propia copia. Vas a trabajar sobre ella toda la concentración, y es la que
vas a clonar en tu instancia.

Déjala **pública**: en la sesión 1 la vas a clonar desde una máquina en la nube que no tiene
tus credenciales de GitHub.

Ahora clónala en tu laptop y ábrela en VS Code:

```bash
git clone https://github.com/TU-USUARIO/TC3009-Part1-2026.git
cd TC3009-Part1-2026
code .
```

---

## 3. Verifica que todo está en su lugar

Marca las cuatro casillas antes de llegar a clase:

- [ ] `git --version` responde algo
- [ ] `git config --global user.name` muestra tu nombre
- [ ] Hiciste fork y lo clonaste; VS Code abre la carpeta y ves `README.md`
- [ ] `git tag` muestra `s1`, `s2`, `s3` y `s4`

Si `git tag` no muestra los cuatro, avisa antes de la sesión — significa que tu fork se hizo
antes de tiempo y el mecanismo de recuperación no te va a funcionar.

---

## 4. Confirma que entras al laboratorio de AWS

Entra a **AWS Academy Learner Lab**, presiona **Start Lab**, espera el punto verde y abre la
consola de AWS.

No crees nada todavía — eso es lo primero que hacemos juntos en la sesión 1. Sólo confirma
que entras y que tienes presupuesto disponible. Si el laboratorio no te abre, resuélvelo
antes de la clase.

**Presiona End Lab** cuando termines de comprobarlo.

---

## Cómo va a ser el ciclo de trabajo

Vale la pena entenderlo desde ahora, porque es distinto a lo que estás acostumbrado:

```
   1. Editas en VS Code, en tu laptop
   2. git add · git commit · git push
   3. En la terminal de tu instancia:  sync
   4. Reinicias los servidores y recargas el navegador
```

Tu código **viaja** hasta donde se ejecuta. No es una molestia del curso: es exactamente lo
que pasa en cualquier producto real, y es más fácil acostumbrarse ahora que descubrirlo
después.

---

## Problemas comunes

**`git` no se reconoce como comando en Windows.**
Reinstala desde git-scm.com y reinicia la terminal. El instalador agrega git al PATH, pero
las terminales ya abiertas conservan el PATH viejo.

**Hice fork pero `git tag` no muestra nada.**
Un fork se lleva los tags que existían al momento de hacerlo. Si los tuyo no los tiene, el
repositorio del curso todavía no los tenía cuando forkeaste. Avisa.

**No tengo cuenta de GitHub con mi correo del Tec.**
No hace falta que sea el del Tec. Cualquier cuenta sirve.

**¿No necesito Python de verdad?**
De verdad. Si ya lo tienes instalado no estorba, pero no lo vamos a usar en tu laptop.
