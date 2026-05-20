import Foundation
import Vision
import AppKit

// Check for arguments
guard CommandLine.arguments.count > 1 else {
    print("Erro: Caminho da imagem não fornecido.")
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let imageUrl = URL(fileURLWithPath: imagePath)

guard let image = NSImage(contentsOf: imageUrl) else {
    print("Erro: Não foi possível carregar a imagem em \(imagePath).")
    exit(1)
}

guard let tiffData = image.tiffRepresentation,
      let bitmapRep = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmapRep.cgImage else {
    print("Erro: Não foi possível converter a imagem para CGImage.")
    exit(1)
}

let requestHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])

// Setup OCR request
let request = VNRecognizeTextRequest { (request, error) in
    if let error = error {
        print("Erro no OCR: \(error.localizedDescription)")
        exit(1)
    }
    
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        exit(0)
    }
    
    // Sort observations top-to-bottom, left-to-right to maintain natural reading order.
    // In VNImageRequestHandler coordinates, y = 0 is at the BOTTOM, y = 1 is at the TOP.
    let sortedObservations = observations.sorted { (obs1, obs2) -> Bool in
        let box1 = obs1.boundingBox
        let box2 = obs2.boundingBox
        
        // If they are on a similar line (vertical overlap), sort left to right
        if abs(box1.origin.y - box2.origin.y) < 0.03 {
            return box1.origin.x < box2.origin.x
        }
        
        // Otherwise, sort top to bottom (higher Y coordinate is higher on the screen)
        return box1.origin.y > box2.origin.y
    }
    
    let recognizedStrings = sortedObservations.compactMap { observation in
        observation.topCandidates(1).first?.string
    }
    
    print(recognizedStrings.joined(separator: "\n"))
}

// Configure request parameters
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

// Run OCR
do {
    try requestHandler.perform([request])
} catch {
    print("Erro ao executar OCR: \(error.localizedDescription)")
    exit(1)
}
