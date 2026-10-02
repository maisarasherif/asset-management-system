// Command test-storage-cleanup removes only a disposable test run's journaled
// R2 objects. The runner supplies the isolated database and unique storage scope.
package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/maisarasherif/asset-management-system/ams-server/utils"
)

func main() {
	_ = godotenv.Load(".env")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	count, err := utils.CleanupTestStorageObjects(ctx)
	fmt.Printf("Test storage cleanup: %d journaled objects deleted\n", count)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
