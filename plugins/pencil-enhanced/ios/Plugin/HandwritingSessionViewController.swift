import UIKit
import PencilKit
import Vision

enum HandwritingFinish {
    case committed(String)
    case cancelled
}

/// PencilKit modal: user writes, then **Insert text** runs Vision OCR and finishes the session.
final class HandwritingSessionViewController: UIViewController {
    let canvasView = PKCanvasView()
    private let toolbar = UIToolbar()
    private let localeId: String

    var onFinish: ((HandwritingFinish) -> Void)?

    init(localeId: String) {
        self.localeId = localeId
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        canvasView.translatesAutoresizingMaskIntoConstraints = false
        canvasView.drawingPolicy = .anyInput
        canvasView.tool = PKInkingTool(.pen, color: .label, width: 18)
        canvasView.backgroundColor = .clear
        view.addSubview(canvasView)

        toolbar.translatesAutoresizingMaskIntoConstraints = false
        let cancel = UIBarButtonItem(title: "Cancel", style: .plain, target: self, action: #selector(cancelTapped))
        let flex = UIBarButtonItem(barButtonSystemItem: .flexibleSpace, target: nil, action: nil)
        let done = UIBarButtonItem(title: "Insert text", style: .done, target: self, action: #selector(doneTapped))
        toolbar.items = [cancel, flex, done]
        view.addSubview(toolbar)

        NSLayoutConstraint.activate([
            toolbar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            toolbar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            toolbar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),

            canvasView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            canvasView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            canvasView.topAnchor.constraint(equalTo: toolbar.bottomAnchor),
            canvasView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    @objc private func cancelTapped() {
        dismiss(animated: true) { [onFinish] in
            onFinish?(.cancelled)
        }
    }

    @objc private func doneTapped() {
        let drawing = canvasView.drawing
        let bounds = drawing.bounds
        guard bounds.width > 2, bounds.height > 2 else {
            dismiss(animated: true) { [onFinish] in
                onFinish?(.committed(""))
            }
            return
        }

        let image = drawing.image(from: bounds, scale: UIScreen.main.scale)
        guard let cgImage = image.cgImage else {
            dismiss(animated: true) { [onFinish] in
                onFinish?(.committed(""))
            }
            return
        }

        DispatchQueue.global(qos: .userInitiated).async { [localeId, weak self] in
            let text = Self.recognizeText(cgImage: cgImage, localeId: localeId)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.dismiss(animated: true) {
                    self.onFinish?(.committed(text))
                }
            }
        }
    }

    private static func recognizeText(cgImage: CGImage, localeId: String) -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = [localeId]

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return ""
        }

        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
