import os
import shutil
import subprocess

# Define paths
POS_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'dhmotopartes', 'dhmotopartes_db.json'))
LOCAL_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), 'dhmotopartes_db.json'))

def sync():
    print("=" * 60)
    print("      DH MOTOPARTES - SINCRONIZADOR WEB CATALOG")
    print("=" * 60)
    
    if not os.path.exists(POS_DB_PATH):
        print(f"❌ Error: No se encontró la base de datos del POS en: {POS_DB_PATH}")
        return

    # 1. Copy POS database locally
    try:
        shutil.copy2(POS_DB_PATH, LOCAL_DB_PATH)
        print("✅ Base de datos copiada exitosamente.")
    except Exception as e:
        print(f"❌ Error al copiar la base de datos: {e}")
        return

    # 2. Run Git commands to commit and push
    try:
        # Check if there are changes to commit
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True)
        if not status.stdout.strip():
            print("ℹ️ No hay cambios en los productos o precios desde la última sincronización.")
            return

        print("📦 Registrando cambios en Git...")
        subprocess.run(["git", "add", "dhmotopartes_db.json"], check=True)
        subprocess.run(["git", "commit", "-m", "Sincronización de base de datos e inventario"], check=True)
        
        print("🚀 Subiendo a GitHub...")
        subprocess.run(["git", "push", "origin", "main"], check=True)
        
        print("\n🎉 ¡Sincronización Completada con éxito!")
        print("Vercel detectará el cambio y actualizará la página web en unos 15 segundos.")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error durante el proceso de Git: {e}")
    except Exception as e:
        print(f"❌ Ocurrió un error inesperado: {e}")

if __name__ == "__main__":
    sync()
